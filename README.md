# 🧊 The Fridge App

> **Stop staring into your fridge like it's a portal to another dimension.**  
> Snap a picture, let Gemini AI map your compartments, and track your groceries with camera scans, quick typing, and quantity counters. All packed into a slick mobile PWA!

---

## ✨ Features That Spark Joy

- 📸 **AI Fridge Mapping**: Take a single photo of your fridge. Gemini AI identifies doors and compartments and turns them into interactive, clickable zones.
- 🤖 **Camera Item Scanner**: Point your phone camera at a carton of milk or jar of mayo — Gemini 3.8 Flash recognizes it instantly without needing barcodes or brand specs.
- ✍️ **Manual Quick-Type**: In a rush? Just type `"Eggs"` and tap **Add**.
- 📋 **Catalog Memory**: Every item you scan or type is saved to a shared catalog dropdown for 1-tap re-adding.
- 🔢 **Multiples & Stepper**: Have 3 bottles of soda? Tap `+` or re-scan to bump the count. No duplicate clutter.
- 📱 **Installable PWA**: Works right on your phone home screen with offline read caching.
- ⚡ **Next.js 16 + Supabase + Vercel**: Real-time serverless stack that costs $0 to run on free tiers.

---

## 🚀 How to Set Up Your Own Fridge in 5 Minutes

Want to track your own culinary kingdom? Follow these steps!

### 1. Prerequisites (All Free!)
- [Node.js](https://nodejs.org/) (v20+ recommended)
- A free [Supabase](https://supabase.com/) account (for database & image storage)
- A free [Google AI Studio API Key](https://aistudio.google.com/) (for Gemini 3.8 Flash)
- A free [Vercel](https://vercel.com/) account (to host the PWA)

---

### 2. Clone & Install

```bash
git clone https://github.com/max38tech/TheFridgeApp.git
cd TheFridgeApp
npm install
```

---

### 3. Set Up the Database (1 Copy-Paste Step)

1. Head to your [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2. Click **SQL Editor** on the left menu.
3. Paste the entire contents of [`supabase-schema.sql`](./supabase-schema.sql) and hit **Run**.

> [!TIP]
> This creates the `tfa_*` tables, disables RLS for easy phase-1 sharing, creates the public `images` storage bucket for fridge photos, and grants API permissions.

---

### 4. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Fill in your secrets:

```env
# From your Supabase Project Settings -> API
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...

# From Google AI Studio (https://aistudio.google.com/)
GEMINI_API_KEY=AIzaSy...
```

---

### 5. Take It For a Spin Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your browser (or use your computer's local network IP on your phone, e.g. `http://192.168.1.X:3000`).

---

### 6. Deploy to Vercel (Mobile-Ready)

1. Push your code to your own GitHub repo.
2. Go to [Vercel](https://vercel.com/new) and **Import** your repository.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GEMINI_API_KEY`
4. Click **Deploy**! 🚀

---

## 📲 Install as an App on Your Phone

Once your Vercel URL is live:

- **iOS (Safari)**: Tap the **Share** button (box with arrow) → scroll down and tap **"Add to Home Screen"**.
- **Android (Chrome)**: Tap the **three dots** menu in top right → tap **"Install App"** (or **"Add to Home screen"**).

Now you have a native-feeling fridge tracker right on your phone!

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Database & Storage**: [Supabase](https://supabase.com/)
- **AI Brain**: [Google Gemini 3.8 Flash](https://ai.google.dev/) via `@google/genai`
- **PWA**: `@ducanh2912/next-pwa`

---

## 💡 Contributing & Future Ideas (Phase 2+)

- [ ] Expiration date warnings & notifications
- [ ] Recipe suggestions based on what's currently in your fridge
- [ ] Barcode scanning support as a fallback
- [ ] Multi-fridge support (garage fridge, wine cooler, freezer chest)

Pull requests and ideas are always welcome! ⭐ Star the repo if your fridge is feeling smarter!
