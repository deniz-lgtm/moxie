"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  contentTypeConfig,
  contentStatusConfig,
  type ContentType,
  type ContentStatus,
} from "@/lib/marketing";
import {
  ArrowLeft,
  FileText,
  Instagram,
  MessageCircle,
  Mail,
  ListChecks,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Calendar,
  Send,
} from "lucide-react";

const contentTypeIcon: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  blog: FileText,
  instagram: Instagram,
  reddit: MessageCircle,
  email: Mail,
  listing: ListChecks,
};

const typePromptHints: Record<ContentType, string> = {
  blog: "Write a 600-800 word SEO-optimized blog post for USC student housing seekers. Include a compelling title, meta description, and natural keyword usage.",
  instagram: "Write an engaging Instagram caption (under 2200 chars) with relevant hashtags. Include a hook in the first line and a clear CTA.",
  reddit: "Write a helpful, authentic Reddit comment for r/USC. Avoid sounding promotional — focus on genuinely helpful info about student housing near campus.",
  email: "Write a marketing email with subject line, preview text, and body. Keep it concise with a clear CTA. Target: prospective USC student tenants.",
  listing: "Write a compelling property listing description. Highlight key amenities, proximity to USC, and unique selling points. Include unit details.",
};

function CreateContentInner() {
  const searchParams = useSearchParams();

  const [contentType, setContentType] = useState<ContentType>(
    (searchParams.get("type") as ContentType) || "blog"
  );
  const [title, setTitle] = useState(searchParams.get("title") || "");
  const [keywords, setKeywords] = useState("");
  const [tone, setTone] = useState("professional");
  const [generatedContent, setGeneratedContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [status, setStatus] = useState<ContentStatus>("draft");

  async function handleGenerate() {
    setIsGenerating(true);
    setGeneratedContent("");

    // Simulate AI generation (stub — wire to Claude API)
    await new Promise((r) => setTimeout(r, 2000));

    const mockOutputs: Record<ContentType, string> = {
      blog: `# ${title || "2026 USC Housing Guide: What Students Need to Know"}\n\n**Meta Description:** Discover the best off-campus housing options near USC for the 2026-2027 academic year. Compare apartments, pricing, and neighborhoods.\n\n---\n\nFinding the right apartment near USC can feel overwhelming, especially with hundreds of options within a few miles of campus. Whether you're an incoming freshman looking for your first off-campus experience or a returning student upgrading your living situation, this guide covers everything you need to know.\n\n## Location Matters More Than You Think\n\nThe neighborhoods surrounding USC each have their own character. The University Park area offers the closest proximity to campus, with most apartments within a 10-minute walk to classes. Further out, areas like Adams-Normandie and Jefferson Park offer more space at lower price points.\n\n**Pro tip:** Factor in your commute to your specific department, not just the main campus entrance.\n\n## What to Budget For\n\nFor the 2026-2027 academic year, expect to budget:\n- **Studio/1BR:** $1,400 – $2,200/month\n- **Shared 2BR:** $900 – $1,400/person\n- **Shared 3BR+:** $750 – $1,100/person\n\nUtilities typically add $50-100/person for water, gas, electric, and internet.\n\n## Key Features to Look For\n\n1. **In-unit laundry** — saves time and money vs. shared facilities\n2. **Responsive maintenance** — ask current residents about response times\n3. **Lease flexibility** — look for August-to-August leases that align with the academic calendar\n4. **Security features** — well-lit parking, secure entry, and package management\n\n## When to Start Looking\n\nLeasing season for Fall 2026 move-ins typically peaks from February through April. Starting early gives you the best selection and often access to early-bird pricing.\n\n---\n\n*Looking for off-campus housing near USC? Browse available units and schedule a tour today.*`,
      instagram: `🏠 Your dream USC apartment is waiting.\n\nWe just wrapped renovations on some incredible units — new flooring, modern kitchens, and in-unit laundry. All just minutes from campus.\n\n✨ What's included:\n→ Walk to USC in under 10 min\n→ In-unit washer/dryer\n→ Responsive 24/7 maintenance\n→ August 2026 move-in ready\n\nEarly bird pricing available now for Fall 2026. Don't wait until April — the best units go fast.\n\n📩 DM us or tap the link in bio to schedule a tour.\n\n#USCHousing #TrojanHousing #USCApartments #OffCampusHousing #StudentLiving #USC2026 #LosAngelesApartments #CollegeHousing #ApartmentHunting #MoxieManagement`,
      reddit: `Hey! I lived off-campus near USC for 3 years and have some thoughts:\n\nFor the $1,200-1,500/person range in a shared unit, you actually have solid options within walking distance. A few things I'd recommend:\n\n1. **Start looking NOW if you want August move-in.** The best places fill up by April, and you don't want to be scrambling in June.\n\n2. **Ask about maintenance response times.** This was the biggest differentiator for me between good and bad landlords. Some places take weeks to fix things, others respond same-day.\n\n3. **Walk the actual route to your classes**, not just to campus. My apartment looked close on a map but my engineering building was on the other side of campus — added 15 min each way.\n\n4. **Read the lease carefully** — some places lock you into 12-month leases starting random dates. Look for ones that align with the academic year (Aug-Aug) so you're not paying for a month you won't be there.\n\n5. **Check if utilities are included.** Some places include water/trash which saves hassle. Others charge RUBs (ratio utility billing) which is fair but adds ~$50-80/mo.\n\nHappy to answer specific questions about neighborhoods if you have them. The area has gotten a lot better in the last few years.`,
      email: `**Subject:** Fall 2026 Early Bird Pricing — Limited Time\n**Preview:** Secure your USC apartment before peak season\n\n---\n\nHi [First Name],\n\nLeasing season is here, and we're offering early bird pricing on select units for Fall 2026 move-in.\n\n**What you get:**\n• Reduced monthly rent on 12-month leases signed before April 15\n• Priority unit selection — choose your exact apartment\n• Waived application fee ($50 value)\n\n**Available units include:**\n• 2BR/1BA — Starting at $2,400/mo ($1,200/person)\n• 3BR/2BA — Starting at $3,300/mo ($1,100/person)\n• Studio — Starting at $1,450/mo\n\nAll units are within walking distance to USC, include in-unit laundry, and come with responsive maintenance support.\n\n[Schedule a Tour →]\n[View Available Units →]\n\nDon't wait — our most popular floor plans filled by mid-April last year.\n\nBest,\nMoxie Management Team`,
      listing: `**Spacious 2BR/1BA — Walk to USC | Fall 2026 Ready**\n\nBright and updated 2-bedroom apartment just 8 minutes on foot from the USC campus entrance. Perfect for students looking for comfortable off-campus living.\n\n**Unit Highlights:**\n• 850 sq ft open floor plan\n• Updated kitchen with dishwasher and disposal\n• In-unit washer and dryer\n• Hardwood floors throughout\n• Central A/C and heating\n• Large closets in both bedrooms\n\n**Building Amenities:**\n• Secured entry with intercom\n• On-site parking available ($150/mo)\n• Package locker system\n• Courtyard common area\n• 24/7 emergency maintenance\n\n**Lease Details:**\n• Available: August 15, 2026\n• Lease term: 12 months (Aug-Aug)\n• Rent: $2,400/month\n• Deposit: $2,400\n\n**Location:** University Park neighborhood, steps from campus, restaurants, and public transit. 8-min walk to Doheny Library, 12-min to Viterbi.\n\nSchedule a tour or apply online today.`,
    };

    setGeneratedContent(mockOutputs[contentType]);
    setIsGenerating(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Link
          href="/marketing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={16} /> Back to Marketing
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Create Content</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate marketing content with AI assistance
        </p>
      </div>

      {/* Content Type Selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-2">
          Content Type
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(contentTypeConfig) as ContentType[]).map((type) => {
            const conf = contentTypeConfig[type];
            const Icon = contentTypeIcon[type] || FileText;
            const active = contentType === type;
            return (
              <button
                key={type}
                onClick={() => setContentType(type)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  active
                    ? `${conf.bgColor} ${conf.color} border-current`
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon size={16} />
                {conf.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Input Fields */}
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
            Title / Topic
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., USC Housing Guide for Fall 2026"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Target Keywords
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g., USC housing, student apartments"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Tone
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual & Friendly</option>
              <option value="authoritative">Authoritative</option>
              <option value="student">Student-Friendly</option>
            </select>
          </div>
        </div>

        {/* AI hint */}
        <div className="bg-muted/30 rounded-xl px-4 py-3 text-xs text-muted-foreground">
          <Sparkles size={12} className="inline text-amber-500 mr-1" />
          <strong>AI Prompt:</strong> {typePromptHints[contentType]}
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {isGenerating ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Generating...
            </>
          ) : (
            <>
              <Sparkles size={16} /> Generate with AI
            </>
          )}
        </button>
      </div>

      {/* Generated Content */}
      {generatedContent && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Generated Content</h3>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div
            className="bg-card rounded-2xl border border-border p-6"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
              {generatedContent}
            </pre>
          </div>

          {/* Schedule / Save */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-muted-foreground" />
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ContentStatus)}
              className="px-3 py-2 rounded-lg border border-border bg-card text-sm"
            >
              <option value="draft">Save as Draft</option>
              <option value="scheduled">Schedule</option>
            </select>
            <button className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors">
              <Send size={14} /> Save
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <strong>Mock output.</strong> Wire to Claude API for real AI-generated content. Save/schedule needs a backend (database or CMS integration).
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateContentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading...</div>}>
      <CreateContentInner />
    </Suspense>
  );
}
