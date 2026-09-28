// SEOCheck AI — audit item bank.
// Weighting scheme (integer weights, total exactly 100):
//   high impact   = 5 pts
//   medium impact = 3 pts
//   low impact    = 1 pt
// Totals: 14 high (70) + 8 medium (24) + 6 low (6) = 100.
// A perfect audit (all 28 checked) therefore scores exactly 100.

const AUDIT_SECTIONS = [
  {
    id: "gbp",
    title: "Google Business Profile",
    icon: "📍",
    items: [
      {
        id: "gbp-verified",
        label: "Profile is claimed and verified",
        tip: "An unverified profile can't be edited and ranks far worse — claim it first.",
        impact: "high",
        weight: 5
      },
      {
        id: "gbp-name",
        label: "Business name matches your real-world name",
        tip: "Stuffing keywords into the name can get you suspended; keep it honest and exact.",
        impact: "high",
        weight: 5
      },
      {
        id: "gbp-categories",
        label: "Primary and secondary categories are set",
        tip: "Categories are Google's main ranking signal for \"what do you do\". Pick the most specific primary.",
        impact: "high",
        weight: 5
      },
      {
        id: "gbp-address",
        label: "Address or service area is correct",
        tip: "Wrong service areas send you to the wrong map pack. Hide your address if you visit customers.",
        impact: "high",
        weight: 5
      },
      {
        id: "gbp-hours",
        label: "Hours are accurate, including holidays",
        tip: "Special-holiday hours prevent angry \"closed when it said open\" reviews.",
        impact: "medium",
        weight: 3
      },
      {
        id: "gbp-phone",
        label: "Phone number is correct",
        tip: "Most local calls come straight from the profile — one wrong digit costs real money.",
        impact: "high",
        weight: 5
      },
      {
        id: "gbp-photos",
        label: "10+ photos uploaded",
        tip: "Businesses with photos get dramatically more direction requests and calls.",
        impact: "medium",
        weight: 3
      },
      {
        id: "gbp-description",
        label: "Description is filled in with keywords",
        tip: "You get 750 characters — use them to say what you do and who it's for.",
        impact: "low",
        weight: 1
      }
    ]
  },
  {
    id: "citations",
    title: "Citations & Directories",
    icon: "📇",
    items: [
      {
        id: "cit-nap",
        label: "NAP (name, address, phone) identical everywhere",
        tip: "Even small mismatches (\"St\" vs \"Street\") confuse Google and dilute trust.",
        impact: "high",
        weight: 5
      },
      {
        id: "cit-yelp",
        label: "Listed on Yelp",
        tip: "Yelp still ranks on page one for \"[service] near me\" searches.",
        impact: "medium",
        weight: 3
      },
      {
        id: "cit-facebook",
        label: "Listed on Facebook",
        tip: "A complete Facebook page doubles as a review and citation source.",
        impact: "low",
        weight: 1
      },
      {
        id: "cit-apple",
        label: "Listed on Apple Maps",
        tip: "iPhone users asking Siri bypass Google entirely — Apple Maps is your only shot.",
        impact: "medium",
        weight: 3
      },
      {
        id: "cit-bing",
        label: "Listed on Bing Places",
        tip: "Free, five minutes, and it powers results in ChatGPT and Edge.",
        impact: "low",
        weight: 1
      },
      {
        id: "cit-duplicates",
        label: "No duplicate listings anywhere",
        tip: "Duplicates split your reviews and authority — find and merge them.",
        impact: "high",
        weight: 5
      }
    ]
  },
  {
    id: "reviews",
    title: "Reviews",
    icon: "⭐",
    items: [
      {
        id: "rev-count",
        label: "20+ Google reviews",
        tip: "Review count is one of the top-3 local ranking factors. 20 is the credibility floor.",
        impact: "high",
        weight: 5
      },
      {
        id: "rev-rating",
        label: "Average rating of 4.0 or higher",
        tip: "Below 4.0 stars, most shoppers scroll straight past you.",
        impact: "high",
        weight: 5
      },
      {
        id: "rev-recent",
        label: "Reviews in the last 30 days",
        tip: "Recency signals an active, trustworthy business — stale reviews look abandoned.",
        impact: "high",
        weight: 5
      },
      {
        id: "rev-positive",
        label: "Responds to positive reviews",
        tip: "A quick thank-you doubles the chance that customer recommends you.",
        impact: "medium",
        weight: 3
      },
      {
        id: "rev-negative",
        label: "Responds to negative reviews within 48 hours",
        tip: "A calm, fast response can win back the reviewer and everyone reading it.",
        impact: "high",
        weight: 5
      },
      {
        id: "rev-ask",
        label: "Uses a review link or QR code to ask customers",
        tip: "Make it effortless: a short link or counter QR beats \"please leave a review\" every time.",
        impact: "low",
        weight: 1
      }
    ]
  },
  {
    id: "website",
    title: "Website Basics",
    icon: "🌐",
    items: [
      {
        id: "web-mobile",
        label: "Mobile-friendly",
        tip: "Most local searches happen on phones — if it pinches and zooms, you lose them.",
        impact: "high",
        weight: 5
      },
      {
        id: "web-title",
        label: "Page title mentions city + service",
        tip: "Your title tag is the #1 on-page signal: \"Plumber in Austin | ABC Plumbing\".",
        impact: "high",
        weight: 5
      },
      {
        id: "web-h1",
        label: "Homepage H1 states what and where",
        tip: "A visitor should know what you do and where in five seconds.",
        impact: "medium",
        weight: 3
      },
      {
        id: "web-call",
        label: "Click-to-call phone number visible",
        tip: "On mobile, a tap-to-call button is the difference between a call and a bounce.",
        impact: "medium",
        weight: 3
      },
      {
        id: "web-footer",
        label: "Address in the footer",
        tip: "A full NAP in the footer reinforces your location to Google on every page.",
        impact: "medium",
        weight: 3
      },
      {
        id: "web-speed",
        label: "Loads in under 3 seconds (self-reported)",
        tip: "Slow sites rank lower and convert worse — test it on your phone over data.",
        impact: "low",
        weight: 1
      },
      {
        id: "web-ssl",
        label: "Has an SSL certificate (https)",
        tip: "\"Not secure\" warnings kill trust instantly; most hosts offer free SSL.",
        impact: "high",
        weight: 5
      },
      {
        id: "web-gbp-link",
        label: "Google Business Profile links to the site",
        tip: "The website link field is free referral traffic — don't leave it empty.",
        impact: "low",
        weight: 1
      }
    ]
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { AUDIT_SECTIONS };
}
