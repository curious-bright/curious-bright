import { prisma } from '../lib/prisma';


// Filtering rules for scope: Curious Bright targets HIGH_SCHOOL and above only.
// Exclude children/early reader content at ingestion time.
const EXCLUDED_TAG_KEYWORDS = [
  'children',
  "children's",
  'juvenile',
  'picture book',
  'early reader',
  'nursery',
  'fairy tales',
  'baby',
  'toddler',
  'preschool',
];

function isChildrenContent(subjects: string[] = [], title: string = ''): boolean {
  const combined = [...subjects, title].join(' ').toLowerCase();
  return EXCLUDED_TAG_KEYWORDS.some((kw) => combined.includes(kw));
}

function mapAcademicLevel(subjects: string[] = [], title: string = ''): 'HIGH_SCHOOL' | 'COLLEGE' | 'GRADUATE' | 'PROFESSIONAL' {
  const text = [...subjects, title].join(' ').toLowerCase();
  
  if (text.includes('quantum') || text.includes('relativity') || text.includes('advanced') || text.includes('monograph') || text.includes('dissertation')) {
    return 'GRADUATE';
  }
  if (text.includes('computer science') || text.includes('calculus') || text.includes('physics') || text.includes('economics') || text.includes('philosophy') || text.includes('algebra')) {
    return 'COLLEGE';
  }
  return 'HIGH_SCHOOL';
}

export async function runBookIngestion() {
  console.log('[Ingestion Job] Starting open-source book metadata ingestion...');

  let addedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  try {
    // 1. Query Gutendex (Project Gutenberg API)
    const gutendexUrl = 'https://gutendex.com/books/?topic=science';
    const response = await fetch(gutendexUrl);
    if (response.ok) {
      const data: any = await response.json();
      const results = data.results || [];

      for (const item of results) {
        const subjects: string[] = item.subjects || [];
        const title: string = item.title || 'Untitled';

        // Filter out children/juvenile content
        if (isChildrenContent(subjects, title)) {
          skippedCount++;
          continue;
        }

        const authorName = item.authors?.[0]?.name || 'Unknown Author';
        const sourceId = String(item.id);
        const coverUrl = item.formats?.['image/jpeg'] || null;
        
        // Find best text/pdf file URL
        const originUrl = 
          item.formats?.['application/pdf'] ||
          item.formats?.['application/epub+zip'] ||
          item.formats?.['text/plain; charset=us-ascii'] ||
          item.formats?.['text/html'] ||
          `https://www.gutenberg.org/ebooks/${sourceId}`;

        const academicLevel = mapAcademicLevel(subjects, title);

        const existing = await prisma.book.findUnique({
          where: { source_sourceId: { source: 'GUTENBERG', sourceId } },
        });

        if (existing) {
          await prisma.book.update({
            where: { id: existing.id },
            data: {
              title,
              author: authorName,
              description: subjects.slice(0, 3).join(', ') || 'Public domain text from Project Gutenberg.',
              coverUrl,
              academicLevel,
              subjectTags: subjects,
              originUrl,
            },
          });
          updatedCount++;
        } else {
          await prisma.book.create({
            data: {
              source: 'GUTENBERG',
              sourceId,
              title,
              author: authorName,
              description: subjects.slice(0, 3).join(', ') || 'Public domain text from Project Gutenberg.',
              coverUrl,
              license: 'Public Domain',
              academicLevel,
              subjectTags: subjects,
              originUrl,
              cacheStatus: 'NOT_CACHED',
            },
          });
          addedCount++;
        }
      }
    }
  } catch (err) {
    console.error('[Ingestion Job] Gutenberg API fetch error:', err);
  }

  // 2. Query Open Library API
  try {
    const openLibraryUrl = 'https://openlibrary.org/subjects/science.json?limit=5';
    const olResponse = await fetch(openLibraryUrl);
    if (olResponse.ok) {
      const olData: any = await olResponse.json();
      const works = olData.works || [];

      for (const work of works) {
        const title = work.title || 'Untitled';
        const authorName = work.authors?.[0]?.name || 'Unknown Author';
        const sourceId = work.key.replace('/works/', ''); // e.g. OL12345W
        const coverUrl = work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-L.jpg` : null;
        
        const iaId = Array.isArray(work.ia) ? work.ia[0] : work.ia;
        // Use Archive.org link if available, otherwise just use Open Library page as a fallback
        const originUrl = iaId ? `https://archive.org/download/${iaId}/${iaId}.pdf` : `https://openlibrary.org${work.key}`;

        const existing = await prisma.book.findUnique({
          where: { source_sourceId: { source: 'OPEN_LIBRARY', sourceId } },
        });

        if (existing) {
          await prisma.book.update({
            where: { id: existing.id },
            data: {
              title,
              author: authorName,
              coverUrl,
              originUrl,
            },
          });
          updatedCount++;
        } else {
          await prisma.book.create({
            data: {
              source: 'OPEN_LIBRARY',
              sourceId,
              title,
              author: authorName,
              description: 'Text from Open Library.',
              coverUrl,
              license: 'Public Domain',
              academicLevel: 'COLLEGE',
              subjectTags: ['Science', 'Open Library'],
              originUrl,
              cacheStatus: 'NOT_CACHED',
            },
          });
          addedCount++;
        }
      }
    }
  } catch (err) {
    console.error('[Ingestion Job] Open Library API fetch error:', err);
  }

  // Fallback / Seed classic open source works if network query yields small set
  const defaultCatalog = [
    {
      source: 'GUTENBERG' as const,
      sourceId: '3618',
      title: 'Relativity: The Special and General Theory',
      author: 'Albert Einstein',
      description: 'The foundational text by Albert Einstein introducing relativity.',
      license: 'Public Domain',
      academicLevel: 'COLLEGE' as const,
      subjectTags: ['Physics', 'Relativity', 'Mathematics'],
      originUrl: 'https://arxiv.org/pdf/physics/0504179.pdf',
    },
    {
      source: 'OPEN_LIBRARY' as const,
      sourceId: 'OL1001',
      title: 'Structure and Interpretation of Computer Programs',
      author: 'Harold Abelson & Gerald Jay Sussman',
      description: 'The world-renowned MIT computer science textbook.',
      license: 'CC-BY-SA-4.0',
      academicLevel: 'COLLEGE' as const,
      subjectTags: ['Computer Science', 'Programming', 'Lisp'],
      originUrl: 'https://raw.githubusercontent.com/sarabander/sicp-pdf/master/sicp.pdf',
    },
    {
      source: 'ARCHIVE_ORG' as const,
      sourceId: 'firstsixbooksbef00eucl',
      title: 'The First Six Books of the Elements of Euclid',
      author: 'Euclid / Oliver Byrne',
      description: 'Oliver Byrne’s 1847 edition of Euclid’s Elements.',
      license: 'Public Domain',
      academicLevel: 'HIGH_SCHOOL' as const,
      subjectTags: ['Geometry', 'Mathematics', 'Classics'],
      originUrl: 'https://archive.org/download/firstsixbooksbef00eucl/firstsixbooksbef00eucl.pdf',
    },
  ];

  for (const book of defaultCatalog) {
    try {
      await prisma.book.upsert({
        where: { source_sourceId: { source: book.source, sourceId: book.sourceId } },
        update: {},
        create: {
          source: book.source,
          sourceId: book.sourceId,
          title: book.title,
          author: book.author,
          description: book.description,
          license: book.license,
          academicLevel: book.academicLevel,
          subjectTags: book.subjectTags,
          originUrl: book.originUrl,
          cacheStatus: 'NOT_CACHED',
        },
      });
    } catch (e) {}
  }

  console.log(`[Ingestion Job] Ingestion run completed: ${addedCount} added, ${updatedCount} updated, ${skippedCount} skipped (children filtered out).`);
  return { addedCount, updatedCount, skippedCount };
}
