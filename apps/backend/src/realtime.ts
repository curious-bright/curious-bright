import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { RealtimeEvents } from '@curious-bright/realtime-contracts';
import { WhiteboardEngine } from '@curious-bright/whiteboard-engine';
import { prisma } from './lib/prisma';
import { verifyToken } from './lib/jwt';
import { uploadWhiteboardSnapshot } from './lib/s3';
import { sendPushNotification } from './lib/push';
import http from 'http';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const whiteboardSessions: Record<string, WhiteboardEngine> = {};
const activeRoomUsers = new Map<string, Map<string, { userId: string; name: string }>>();

export function attachRealtimeServer(server: http.Server) {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  let isRedisConnected = false;
  const pubClient = createClient({ url: REDIS_URL });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => {
    isRedisConnected = false;
  });
  subClient.on('error', (err) => {
    isRedisConnected = false;
  });

  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      isRedisConnected = true;
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Realtime] Redis adapter connected');
    })
    .catch((err) => {
      isRedisConnected = false;
      console.warn('[Realtime] Redis unavailable, using in-memory adapter:', err.message);
    });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    
    try {
      const decoded = verifyToken(token);
      (socket as any).user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  function broadcastRoomPresence(roomId: string) {
    const roomUsers = activeRoomUsers.get(roomId);
    const activeList = roomUsers ? Array.from(roomUsers.values()) : [];
    io.to(roomId).emit('room:presence', activeList);
  }

  io.on('connection', (socket) => {
    const user = (socket as any).user;
    console.log(`Socket client connected: ${socket.id} (User: ${user.id})`);
    let currentRoomId: string | null = null;

    socket.on('room:join', async (roomId: string) => {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, name: true }
        });

        socket.join(roomId);
        currentRoomId = roomId;
        console.log(`User ${user.id} (${dbUser?.name}) joined room ${roomId}`);

        if (!activeRoomUsers.has(roomId)) {
          activeRoomUsers.set(roomId, new Map());
        }
        activeRoomUsers.get(roomId)!.set(socket.id, {
          userId: user.id,
          name: dbUser?.name || 'Member',
        });

        broadcastRoomPresence(roomId);
      } catch (error) {
        console.error(`Failed to join room:`, error);
      }
    });

    socket.on(RealtimeEvents.MESSAGE_SEND, async (payload) => {
      try {
        if (isRedisConnected) {
          try {
            const rateLimitKey = `rate_limit:msg:${user.id}`;
            const requests = await pubClient.incr(rateLimitKey);
            if (requests === 1) {
              await pubClient.expire(rateLimitKey, 10);
            }
            if (requests > 5) {
              socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
              return;
            }
          } catch (e) {
            // If redis operation fails mid-flight, proceed gracefully
          }
        }

        const message = await prisma.message.create({
          data: {
            roomId: payload.roomId,
            senderId: user.id,
            content: payload.content,
            attachmentUrl: payload.attachmentUrl,
            replyToId: payload.replyToId,
          },
          include: { sender: { select: { name: true } } }
        });

        const broadcastPayload = {
          ...payload,
          senderId: user.id,
          senderName: message.sender.name,
          createdAt: message.createdAt.toISOString(),
        };

        const mentionRegex = /@(\w+)/g;
        const mentions = Array.from(payload.content.matchAll(mentionRegex), (m: any) => m[1]);
        if (mentions.length > 0) {
          const mentionedUsers = await prisma.user.findMany({
            where: {
              name: { in: mentions },
              roomMemberships: { some: { roomId: payload.roomId } }
            }
          });
          
          for (const mUser of mentionedUsers) {
            if (mUser.id !== user.id) {
              await sendPushNotification(
                mUser.id,
                'New Mention',
                `${message.sender.name} mentioned you in a room.`,
                { url: `/room/${payload.roomId}` }
              );
            }
          }
        }

        io.to(payload.roomId).emit(RealtimeEvents.MESSAGE_RECEIVE, broadcastPayload);
      } catch (error) {
        console.error('Failed to persist message:', error);
      }
    });

    socket.on(RealtimeEvents.PRESENCE_UPDATE, (payload) => {
      socket.broadcast.emit(RealtimeEvents.PRESENCE_UPDATE, payload);
    });

    socket.on(RealtimeEvents.WHITEBOARD_UPDATE, (payload: { roomId: string; update: Uint8Array }) => {
      const { roomId, update } = payload;
      if (!whiteboardSessions[roomId]) {
        whiteboardSessions[roomId] = new WhiteboardEngine();
      }
      whiteboardSessions[roomId].applyUpdate(new Uint8Array(update));
      
      socket.to(roomId).emit(RealtimeEvents.WHITEBOARD_UPDATE, {
        roomId,
        update: Array.from(update),
      });
    });

    socket.on(RealtimeEvents.WHITEBOARD_SYNC, (payload: { roomId: string }) => {
      const { roomId } = payload;
      if (!whiteboardSessions[roomId]) {
        whiteboardSessions[roomId] = new WhiteboardEngine();
      }
      const state = whiteboardSessions[roomId].encodeState();
      socket.emit(RealtimeEvents.WHITEBOARD_SYNC, {
        roomId,
        state: Array.from(state),
      });
    });

    socket.on(RealtimeEvents.CALL_INVITE, (payload) => {
      socket.to(payload.roomId).emit(RealtimeEvents.CALL_INVITE, payload);
    });

    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
      if (currentRoomId && activeRoomUsers.has(currentRoomId)) {
        activeRoomUsers.get(currentRoomId)!.delete(socket.id);
        broadcastRoomPresence(currentRoomId);
      }
    });
  });

  setInterval(async () => {
    for (const [roomId, engine] of Object.entries(whiteboardSessions)) {
      try {
        const state = engine.encodeState();
        const snapshotUrl = await uploadWhiteboardSnapshot(roomId, state);
        
        await prisma.whiteboardSession.upsert({
          where: { roomId },
          create: { roomId, snapshotUrl },
          update: { snapshotUrl },
        });
        console.log(`[Whiteboard] Saved snapshot for room ${roomId}`);
      } catch (err) {
        console.error(`[Whiteboard] Failed to save snapshot for room ${roomId}`, err);
      }
    }
  }, 60000);

  return io;
}
