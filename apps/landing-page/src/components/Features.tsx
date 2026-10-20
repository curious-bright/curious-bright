import React from 'react';
import { Edit3, PenTool, MessageSquare, ArrowRight, Rss, Award, Bell } from 'lucide-react';
import { colors } from '@curious-bright/ui-kit';

const featureList = [
  {
    noteTag: 'NOTE 01',
    author: 'COMMUNITY // KNOWLEDGE FEED',
    color: colors.coral,
    bgColor: 'rgba(255, 90, 54, 0.08)',
    borderColor: 'rgba(255, 90, 54, 0.3)',
    title: 'Teach and learn in one feed',
    description: 'Post explanations, questions and worked examples. Reply, like, and mark what helped you most — the community feed is where knowledge gets shared every day.',
    actionText: 'Open the Feed →',
    actionUrl: 'https://app.curiousbright.com.ng/feed',
    icon: Rss,
  },
  {
    noteTag: 'NOTE 02',
    author: 'PROF. CHEN // BADGES',
    color: colors.teal,
    bgColor: 'rgba(0, 168, 150, 0.08)',
    borderColor: 'rgba(0, 168, 150, 0.3)',
    title: 'Badges that reward helping others',
    description: 'Earn Teacher when your comments help, Solver when you solve a tricky question, and Collaborator when you co-author a research document. Your profile shows them all.',
    actionText: 'See Badges →',
    actionUrl: 'https://app.curiousbright.com.ng/register',
    icon: Award,
  },
  {
    noteTag: 'NOTE 03',
    author: 'STUDENTS // FOLLOW & NOTIFY',
    color: colors.mustard,
    bgColor: 'rgba(244, 180, 61, 0.12)',
    borderColor: 'rgba(244, 180, 61, 0.4)',
    title: 'Follow the people who explain best',
    description: 'Follow classmates, teachers and researchers. Get notified on replies, mentions and study invites so you never miss a conversation you care about.',
    actionText: 'Create Account →',
    actionUrl: 'https://app.curiousbright.com.ng/register',
    icon: Bell,
  },
  {
    noteTag: 'NOTE 04',
    author: 'OKIKIOLAMILEKAN // LIVE WRITING',
    color: colors.coral,
    bgColor: 'rgba(255, 90, 54, 0.08)',
    borderColor: 'rgba(255, 90, 54, 0.3)',
    title: 'Collaborate on research docs live',
    description: 'Invite co-authors to a research document, edit together in real time, and keep every revision. No emailing file versions back and forth.',
    actionText: 'Start Co-Writing →',
    actionUrl: 'https://app.curiousbright.com.ng/research',
    icon: Edit3,
  },
  {
    noteTag: 'NOTE 05',
    author: 'DR. TOMIWA // MATH & DIAGRAMS',
    color: colors.teal,
    bgColor: 'rgba(0, 168, 150, 0.08)',
    borderColor: 'rgba(0, 168, 150, 0.3)',
    title: 'Equations that render beautifully',
    description: 'Write inline and block math with LaTeX in any post or comment, so science and maths explanations stay clear, readable and easy to follow.',
    actionText: 'Browse Knowledge →',
    actionUrl: 'https://app.curiousbright.com.ng/feed',
    icon: PenTool,
  },
  {
    noteTag: 'NOTE 06',
    author: 'PROF. CHEN // PEER REVIEWS',
    color: colors.mustard,
    bgColor: 'rgba(244, 180, 61, 0.12)',
    borderColor: 'rgba(244, 180, 61, 0.4)',
    title: 'Friendly peer feedback',
    description: 'Leave margin notes, ask questions and suggest edits. Get helpful feedback from classmates, teachers and mentors — right next to the sentence in question.',
    actionText: 'Explore the Community →',
    actionUrl: 'https://app.curiousbright.com.ng/feed',
    icon: MessageSquare,
  },
];

export const Features: React.FC = () => {
  return (
    <section id="features" className="py-20 bg-gradient-to-b from-transparent via-white/50 to-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="mb-14 space-y-2">
          <div className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--color-coral)]">
            SHARE WHAT YOU KNOW // COLLABORATE ON RESEARCH
          </div>
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-[var(--color-ink)]">
            Built for the speed of live thought.
          </h2>
          <p className="text-[var(--color-faded-ink)] max-w-xl text-base">
            Everything a learning community needs — knowledge feed, badges, notifications and live research
            documents — in one free platform.
          </p>
        </div>

        {/* 6 Comment Corner Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {featureList.map((item, index) => {
            const Icon = item.icon;
            return (
              <div 
                key={index} 
                className="comment-corner-card bg-white flex flex-col justify-between p-7 hover:-translate-y-1 transition-all group"
              >
                <div className="comment-corner-ear" title="Peel note corner" />
                
                <div className="space-y-4">
                  {/* Note Label & Author Tag */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[var(--color-faded-ink)] bg-[#F7F6F2] px-2 py-0.5 rounded-sm">
                      {item.noteTag}
                    </span>
                    <span 
                      className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-sm border"
                      style={{ color: item.color, backgroundColor: item.bgColor, borderColor: item.borderColor }}
                    >
                      {item.author}
                    </span>
                  </div>

                  {/* Icon & Title */}
                  <div className="space-y-2 pt-2">
                    <div 
                      className="w-10 h-10 rounded-sm flex items-center justify-center mb-3"
                      style={{ backgroundColor: item.bgColor }}
                    >
                      <Icon className="w-5 h-5" style={{ color: item.color }} />
                    </div>
                    <h3 className="font-display font-bold text-xl text-[var(--color-ink)] group-hover:text-[var(--color-coral)] transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-sm text-[var(--color-faded-ink)] leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Action Link */}
                <div className="pt-6 border-t border-[var(--color-line)] mt-6">
                  <a 
                    href={item.actionUrl}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                    style={{ color: item.color }}
                  >
                    <span>{item.actionText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
