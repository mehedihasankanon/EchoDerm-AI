/**
 * i18n.ts — Bangla / English language support for EchoDerm AI.
 *
 * Owner: Tamim (UI Architect)
 *
 * Simple key-value translation system. No heavy i18n library needed.
 */

export type Language = "en" | "bn";

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Header
    "app.title": "EchoDerm AI",
    "app.subtitle": "Dual-Modal Diagnostic Co-pilot for Rural Health Clinics",

    // Upload Section
    "upload.rash.title": "Skin Rash Photo",
    "upload.rash.button": "Select Image",
    "upload.audio.title": "Cough Audio",
    "upload.audio.button": "Select Audio",
    "upload.audio.record": "🎤 Record Cough",
    "upload.audio.recording": "Recording...",
    "upload.audio.stop": "Stop",

    // Patient
    "patient.id.label": "Patient ID",
    "patient.id.placeholder": "Enter patient name or ID",

    // Analyze
    "analyze.button": "Evaluate",
    "analyze.loading": "Analyzing...",
    "analyze.error.both": "Please upload both a rash image and a cough recording.",

    // Results
    "result.diagnosis": "Primary Diagnosis",
    "result.confidence": "Confidence",
    "result.visual": "Visual Findings",
    "result.acoustic": "Acoustic Findings",
    "result.reasoning": "Differential Notes",
    "result.nextsteps": "Recommended Next Steps",
    "result.patient_id": "Patient ID",

    // Explainability
    "explain.title": "🔍 AI Explainability Report",
    "explain.visual_confidence": "Visual Confidence",
    "explain.acoustic_confidence": "Acoustic Confidence",
    "explain.cross_modal": "Cross-Modal Agreement",
    "explain.concordant": "✅ Concordant",
    "explain.discordant": "⚠️ Discordant — Signals Conflict",
    "explain.model": "Model",
    "explain.inference_time": "Inference Time",
    "explain.version": "System Instruction Version",

    // Ethical
    "ethical.disclaimer": "⚠️ Decision-support tool only — not a clinical diagnosis. Always consult a health professional.",
    "ethical.consent.title": "⚕️ IMPORTANT: Please Read",
    "ethical.consent.body": "EchoDerm AI is a DECISION-SUPPORT tool. It does NOT replace a doctor's diagnosis.",
    "ethical.consent.data": "📋 DATA USAGE:",
    "ethical.consent.data.1": "Photos and audio are sent to Google Gemini for analysis and are NOT stored permanently.",
    "ethical.consent.data.2": "Diagnostic results are stored anonymously in our database for public health monitoring.",
    "ethical.consent.data.3": "No personally identifiable information (name, address, phone) is collected.",
    "ethical.consent.limitations": "⚠️ LIMITATIONS:",
    "ethical.consent.limitations.1": "This tool has NOT been clinically validated.",
    "ethical.consent.limitations.2": "Accuracy may vary with image quality and ambient noise levels.",
    "ethical.consent.limitations.3": "Always consult a qualified health professional.",
    "ethical.consent.checkbox": "I understand this is a support tool, not a definitive diagnosis.",
    "ethical.consent.accept": "Accept & Continue",

    // WHO Guidelines
    "who.title": "⚕️ WHO Clinical Guidelines",
    "who.avoid": "🚫 STRICTLY AVOID",
    "who.actions": "✅ Immediate Actions",
    "who.danger": "🔴 Danger Signs",
    "who.medications": "💊 Medications",
    "who.referral": "🏥 Referral Criteria",
    "who.isolation": "🔒 Isolation Required",

    // Offline
    "offline.banner": "📡 You are offline — data will sync when connected",
    "offline.queue": "items waiting to sync",
    "offline.syncing": "Syncing...",
    "offline.llama.title": "Offline Triage (AI on Device)",
    "offline.llama.placeholder": "Describe symptoms: fever, rash location, cough type...",
    "offline.llama.button": "Get Preliminary Advice",
    "offline.llama.loading": "Loading AI model...",
    "offline.llama.disclaimer": "⚠️ Preliminary offline assessment only",

    // Dashboard
    "dashboard.title": "📊 Epidemic Dashboard",
    "dashboard.total": "Total Scans",
    "dashboard.measles": "Measles",
    "dashboard.dengue": "Dengue",
    "dashboard.period": "Last 7 Days",

    // Language
    "lang.toggle": "বাংলা",
  },

  bn: {
    // Header
    "app.title": "ইকোডার্ম এআই",
    "app.subtitle": "গ্রামীণ স্বাস্থ্য ক্লিনিকের জন্য ডুয়াল-মোডাল ডায়াগনস্টিক সহ-পাইলট",

    // Upload Section
    "upload.rash.title": "ত্বকের ফুসকুড়ির ছবি",
    "upload.rash.button": "ছবি নির্বাচন করুন",
    "upload.audio.title": "কাশির অডিও",
    "upload.audio.button": "অডিও নির্বাচন করুন",
    "upload.audio.record": "🎤 কাশি রেকর্ড করুন",
    "upload.audio.recording": "রেকর্ড হচ্ছে...",
    "upload.audio.stop": "বন্ধ",

    // Patient
    "patient.id.label": "রোগীর আইডি",
    "patient.id.placeholder": "রোগীর নাম বা আইডি লিখুন",

    // Analyze
    "analyze.button": "তাৎক্ষণিক বিশ্লেষণ",
    "analyze.loading": "বিশ্লেষণ করা হচ্ছে...",
    "analyze.error.both": "অনুগ্রহ করে একটি ফুসকুড়ির ছবি এবং একটি কাশির রেকর্ডিং আপলোড করুন।",

    // Results
    "result.diagnosis": "প্রাথমিক রোগ নির্ণয়",
    "result.confidence": "আত্মবিশ্বাস",
    "result.visual": "দৃশ্য বিশ্লেষণ",
    "result.acoustic": "শব্দ বিশ্লেষণ",
    "result.reasoning": "বিভেদমূলক নোট",
    "result.nextsteps": "পরবর্তী পদক্ষেপ",
    "result.patient_id": "রোগীর আইডি",

    // Explainability
    "explain.title": "🔍 এআই ব্যাখ্যা প্রতিবেদন",
    "explain.visual_confidence": "দৃশ্য আত্মবিশ্বাস",
    "explain.acoustic_confidence": "শব্দ আত্মবিশ্বাস",
    "explain.cross_modal": "ক্রস-মোডাল চুক্তি",
    "explain.concordant": "✅ সমতুল্য",
    "explain.discordant": "⚠️ অসমতুল্য — সংকেত দ্বন্দ্ব",
    "explain.model": "মডেল",
    "explain.inference_time": "বিশ্লেষণ সময়",
    "explain.version": "সিস্টেম নির্দেশনা সংস্করণ",

    // Ethical
    "ethical.disclaimer": "⚠️ শুধুমাত্র সিদ্ধান্ত-সহায়ক টুল — ক্লিনিক্যাল রোগ নির্ণয় নয়। সর্বদা একজন স্বাস্থ্য পেশাদারের সাথে পরামর্শ করুন।",
    "ethical.consent.title": "⚕️ গুরুত্বপূর্ণ: অনুগ্রহ করে পড়ুন",
    "ethical.consent.body": "ইকোডার্ম এআই একটি সিদ্ধান্ত-সহায়ক টুল। এটি ডাক্তারের রোগ নির্ণয়ের বিকল্প নয়।",
    "ethical.consent.data": "📋 তথ্য ব্যবহার:",
    "ethical.consent.data.1": "ছবি এবং অডিও বিশ্লেষণের জন্য Google Gemini-তে পাঠানো হয় এবং স্থায়ীভাবে সংরক্ষণ করা হয় না।",
    "ethical.consent.data.2": "জনস্বাস্থ্য পর্যবেক্ষণের জন্য ডায়াগনস্টিক ফলাফল বেনামে সংরক্ষণ করা হয়।",
    "ethical.consent.data.3": "কোনো ব্যক্তিগত তথ্য (নাম, ঠিকানা, ফোন) সংগ্রহ করা হয় না।",
    "ethical.consent.limitations": "⚠️ সীমাবদ্ধতা:",
    "ethical.consent.limitations.1": "এই টুলটি ক্লিনিক্যালি যাচাই করা হয়নি।",
    "ethical.consent.limitations.2": "ছবির মান এবং পরিবেশের শব্দের উপর নির্ভর করে সঠিকতা পরিবর্তিত হতে পারে।",
    "ethical.consent.limitations.3": "সর্বদা একজন যোগ্য স্বাস্থ্য পেশাদারের সাথে পরামর্শ করুন।",
    "ethical.consent.checkbox": "আমি বুঝতে পারছি এটি একটি সহায়ক টুল, চূড়ান্ত রোগ নির্ণয় নয়।",
    "ethical.consent.accept": "গ্রহণ করুন এবং চালিয়ে যান",

    // WHO Guidelines
    "who.title": "⚕️ WHO ক্লিনিক্যাল গাইডলাইন",
    "who.avoid": "🚫 কঠোরভাবে এড়িয়ে চলুন",
    "who.actions": "✅ তাৎক্ষণিক পদক্ষেপ",
    "who.danger": "🔴 বিপদ সংকেত",
    "who.medications": "💊 ওষুধ",
    "who.referral": "🏥 রেফারেল মানদণ্ড",
    "who.isolation": "🔒 আইসোলেশন প্রয়োজন",

    // Offline
    "offline.banner": "📡 আপনি অফলাইন — সংযুক্ত হলে ডেটা সিঙ্ক হবে",
    "offline.queue": "টি আইটেম সিঙ্কের অপেক্ষায়",
    "offline.syncing": "সিঙ্ক হচ্ছে...",
    "offline.llama.title": "অফলাইন ট্রায়াজ (ডিভাইসে এআই)",
    "offline.llama.placeholder": "লক্ষণ বর্ণনা করুন: জ্বর, ফুসকুড়ির অবস্থান, কাশির ধরন...",
    "offline.llama.button": "প্রাথমিক পরামর্শ নিন",
    "offline.llama.loading": "এআই মডেল লোড হচ্ছে...",
    "offline.llama.disclaimer": "⚠️ শুধুমাত্র প্রাথমিক অফলাইন মূল্যায়ন",

    // Dashboard
    "dashboard.title": "📊 মহামারী ড্যাশবোর্ড",
    "dashboard.total": "মোট স্ক্যান",
    "dashboard.measles": "হাম",
    "dashboard.dengue": "ডেঙ্গু",
    "dashboard.period": "শেষ ৭ দিন",

    // Language
    "lang.toggle": "English",
  },
};

/**
 * Get a translated string for the given key and language.
 */
export function t(key: string, lang: Language = "en"): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

/**
 * Get all available languages.
 */
export function getLanguages(): { code: Language; name: string }[] {
  return [
    { code: "en", name: "English" },
    { code: "bn", name: "বাংলা" },
  ];
}
