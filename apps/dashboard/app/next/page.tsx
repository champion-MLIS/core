/**
 * "Three things to do today" — public landing page linked from the inbound
 * "text HOME" auto-reply. Mobile-first (most visits come from a phone), warm,
 * uncluttered. Copy is a starting draft; pastoral leadership owns the voice.
 * Edit this file freely.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome home — Champion Church',
  description: 'Three things you can do today after the most important decision of your life.',
  robots: { index: false, follow: false },
};

export default function NextPage() {
  return (
    <main className="min-h-dvh bg-stone-50 text-stone-900">
      <div className="mx-auto max-w-xl px-6 py-12 sm:py-16">
        <header>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
            Champion Church
          </p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Welcome home.</h1>
          <p className="mt-5 text-lg leading-relaxed text-stone-700">
            You just made the most important decision of your life. Here are three things you can do
            today — none of them complicated, none of them alone.
          </p>
        </header>

        <section className="mt-10 space-y-8">
          <Step
            n={1}
            heading="Open a Bible to John, chapter 1."
            body={
              <>
                Read it slowly. This is the simplest, clearest place to meet Jesus in his own
                words. Don&rsquo;t worry about understanding everything yet — just read.
                <br />
                <a
                  href="https://www.bible.com/bible/116/JHN.1.NLT"
                  className="mt-2 inline-block text-stone-900 underline underline-offset-4 hover:text-stone-700"
                >
                  Read John 1 →
                </a>
              </>
            }
          />

          <Step
            n={2}
            heading="Talk to God."
            body={
              <>
                Out loud or in your head — either is fine. It can be simple:
                <em className="mt-2 block border-l-2 border-stone-300 pl-4 not-italic text-stone-700">
                  &ldquo;God, I&rsquo;m here. I gave you my life today. Help me follow you.&rdquo;
                </em>
                That&rsquo;s all it has to be. He hears you.
              </>
            }
          />

          <Step
            n={3}
            heading="Tell one person."
            body={
              <>
                One person. Today. Family, a friend, anyone you trust. Saying it out loud
                anchors it. And it makes us your family too — we&rsquo;d love to know who they are.
              </>
            }
          />
        </section>

        <footer className="mt-12 rounded-lg bg-white p-6 shadow-sm ring-1 ring-stone-200">
          <p className="text-sm leading-relaxed text-stone-700">
            Someone from our Champion family is reaching out personally within 24 hours. Until then,
            breathe. You&rsquo;re not doing this alone.
          </p>
          <p className="mt-4 text-sm font-medium text-stone-900">— Pastor Stephen + the Champion family</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a
              href="https://champion.church"
              className="text-stone-600 underline underline-offset-4 hover:text-stone-900"
            >
              Visit us Sunday →
            </a>
            <a
              href="mailto:hello@championchurch.org"
              className="text-stone-600 underline underline-offset-4 hover:text-stone-900"
            >
              Have a question now →
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}

function Step({ n, heading, body }: { n: number; heading: string; body: React.ReactNode }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0">
        <span className="grid size-9 place-items-center rounded-full bg-stone-900 font-semibold text-white">
          {n}
        </span>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-stone-900">{heading}</h2>
        <div className="mt-2 leading-relaxed text-stone-700">{body}</div>
      </div>
    </div>
  );
}
