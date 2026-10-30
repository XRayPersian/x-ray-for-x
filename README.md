# 🕵️ X-Ray: Account Check for X (Twitter)

> **A smart, privacy-first open-source browser extension for X (formerly Twitter) to analyze political alignments, account authenticity, and bot/troll patterns.**
>
> افزونه متن‌باز، هوشمند و حافظ حریم خصوصی برای کالبدشکافی اصالت اکانت‌ها، خطوط سیاسی و تشخیص حساب‌های فیک و سایبری در توییتر (ایکس).

---

### 🌐 Language / زبان
* [🦁☀️ راهنمای فارسی (Persian Guide)](#-راهنمای-فارسی)
* [🇬🇧 English Guide](#-english-guide)

---

# 🦁☀️ راهنمای فارسی

## فهرست مطالب
1. [معرفی و بررسی اجمالی](#معرفی-و-بررسی-اجمالی)
2. [قابلیت‌های کلیدی](#قابلیت‌های-کلیدی)
3. [پیش‌نیاز: دریافت رایگان کلید Groq API](#پیشنیاز-دریافت-رایگان-کلید-groq-api)
4. [راهنمای نصب گام‌به‌گام در گوگل کروم](#راهنمای-نصب-گامبهگام-در-گوگل-کروم)
5. [نحوه استفاده در x.com](#نحوه-استفاده-در-xcom)
6. [حریم خصوصی و امنیت](#حریم-خصوصی-و-امنیت)
7. [پرسش‌های متداول (FAQ)](#پرسشهای-متداول-faq)

---

## معرفی و بررسی اجمالی
افزونه **X-Ray** ابزاری تخصصی، سریع و کاملاً سمت کاربر (Client-Side) است که با استفاده از مدل‌های زبانی پیشرفته بر روی چیپ‌های هوش مصنوعی Groq LPU™، سابقهٔ فعالیت، گفتمان، هشتگ‌ها و الگوهای رفتاری اکانت‌های توییتر (X) را تحلیل می‌کند.

این ابزار به شما کمک می‌کند تا به راحتی در فید توییتر، گرایش‌های سازمان‌یافته، حساب‌های پوششی (False Flag)، حامیان جریانات مختلف و کاربران ارگانیک و عادی را از یکدیگر تفکیک کنید.

---

## قابلیت‌های کلیدی
* **⚡ سرعت فوق‌العاده:** با اتصال به پردازنده‌های Groq LPU™ و مدل قدرتمند `llama-3.3-70b-versatile`، تحلیل هر توییت یا پروفایل در کسری از ثانیه انجام می‌شود.
* **🎯 ادغام مستقیم با فید و پروفایل:**
  * دکمهٔ **🕵️ اکانت‌چک** در زیر هر توییت در تایم‌لاین.
  * دکمهٔ اختصاصی اسکن در هدر صفحهٔ پروفایل هر کاربر.
* **🛡️ صد در صد حافظ حریم خصوصی (Zero Data Collection):**
  * هیچ سرور واسطه‌ای وجود ندارد. تمام تحلیل‌ها مستقیم بین مرورگر شما و API رسمی Groq صورت می‌گیرد.
  * کلید API شما فقط در حافظهٔ محافظت‌شده مرورگر شما (`chrome.storage.sync`) نگهداری می‌شود.
* **🌑 سازگار با تم‌های تاریک توییتر:** هماهنگ با حالت‌های Dark Mode و Dimmed توییتر به همراه جلوه‌های بصری آبی نئونی (X-Ray Cyan).
* **📋 کپی آسان گزارش:** امکان کپی فوری خلاصهٔ تحلیل و درصدها در کلیپ‌بورد برای اشتراک‌گذاری.
* **بدون وابستگی خارجی (Zero Dependencies):** نوشته شده با جاوااسکریپت خالص (Vanilla JS) بدون نیاز به کامپایل یا پکیج‌های npm.

---

## پیش‌نیاز: دریافت رایگان کلید Groq API
این افزونه از API رایگان سرویس معتبر Groq استفاده می‌کند. ساخت کلید کمتر از ۱ دقیقه زمان می‌برد:

1. وارد سایت [console.groq.com/keys](https://console.groq.com/keys) شوید.
2. با ایمیل، اکانت گوگل یا گیت‌هاب خود به رایگان ثبت‌نام کنید.
3. بر روی دکمهٔ **Create API Key** کلیک کنید.
4. یک نام دلخواه (مثلاً `X-Ray Extension`) وارد کرده و کلید تولید شده (که با `gsk_` شروع می‌شود) را کپی کنید.

---

## راهنمای نصب گام‌به‌گام در گوگل کروم

1. **دانلود پروژه:**
   * در بالای همین صفحه گیت‌هاب، بر روی دکمهٔ سبز رنگ **Code ▾** کلیک کرده و گزینهٔ **Download ZIP** را انتخاب کنید.
   * فایل ZIP دانلود شده را در کامپیوتر خود استخراج (Extract) کنید.

2. **باز کردن صفحه افزونه‌ها در مرورگر:**
   * مرورگر Google Chrome (یا Brave / Edge / Arc) را باز کنید.
   * در نوار آدرس عبارت `chrome://extensions` را وارد کرده و Enter بزنید.

3. **فعال‌سازی حالت برنامه‌نویس (Developer Mode):**
   * در گوشهٔ بالا سمت راست صفحه، کلید **Developer mode** را روشن کنید.

4. **بارگذاری افزونه:**
   * در گوشهٔ بالا سمت چپ، بر روی دکمهٔ **Load unpacked** (بارگذاری افزونه باز شده) کلیک کنید.
   * پوشهٔ استخراج‌شدهٔ پروژه را انتخاب کنید.

5. **پین کردن و ثبت کلید API:**
   * بر روی آیکون پازل در نوار بالای مرورگر کلیک کرده و سنجاق (Pin) کنار **X-Ray** را فعال کنید.
   * بر روی آیکون افزونه کلیک کنید و کلید Groq خود را که دریافت کرده بودید وارد نمایید و دکمهٔ ذخیره را بزنید.

---

## نحوه استفاده در x.com
1. وارد سایت [x.com](https://x.com) شوید.
2. در زیر هر توییت، دکمهٔ جدید **🕵️ اکانت‌چک** اضافه شده است.
3. با کلیک بر روی آن، پنجره‌ای شناور باز می‌شود که گرایش سیاسی، برچسب هویتی و میزان اطمینان تحلیل را نمایش می‌دهد.
4. همچنین با باز کردن پروفایل هر کاربر، دکمهٔ **اسکن عمیق پروفایل** را مشاهده خواهید کرد.

---

## حریم خصوصی و امنیت
* **کد متن‌باز:** سورس‌کد کامل پروژه در این مخزن عمومی قابل بررسی و حسابرسی است.
* **بدون ترکینگ و تبلیغات:** هیچ کتابخانهٔ تحلیلی، تبلیغاتی یا ثبت‌کننده لاگ در این اکستنشن وجود ندارد.
* **رمزنگاری کامل:** تمام درخواست‌ها به صورت TLS/HTTPS مستقیم به اندپوینت امن Groq ارسال می‌شوند.

---

## پرسش‌های متداول (FAQ)

#### پیغام «Groq API-Key required» ظاهر می‌شود:
بر روی آیکون افزونه در بالای مرورگر کلیک کنید و مطمئن شوید کلید معتبری وارد کرده‌اید.

#### پیغام خطا یا Rate Limit دریافت کردم:
سرویس Groq سقف مصرف رایگان بسیار بالایی دارد. در صورتی که در مدت کوتاهی توییت‌های متعددی را اسکن کردید، چند ثانیه صبر کرده و مجدداً تلاش کنید.

---
---

# 🇬🇧 English Guide

## Table of Contents
1. [Overview & Purpose](#overview--purpose)
2. [Key Features](#key-features)
3. [Prerequisite: Free Groq API Key](#prerequisite-free-groq-api-key)
4. [Step-by-Step Chrome Installation](#step-by-step-chrome-installation)
5. [Usage on x.com](#usage-on-xcom)
6. [Architecture & Privacy Design](#architecture--privacy-design)
7. [Troubleshooting & FAQ](#troubleshooting--faq)
8. [License](#license)

---

## Overview & Purpose
**X-Ray: Account Check for X** is an open-source, client-side browser extension engineered to analyze authenticity, discourse patterns, and political stances of accounts on X (formerly Twitter).

Powered by Groq's ultra-fast LPU™ inference engine (`llama-3.3-70b-versatile`), it provides instant contextual breakdown of tweet content, profile background, historical rhetoric, and coordinated bot/troll patterns directly inside your X timeline.

---

## Key Features
* **⚡ Sub-Second Inference:** Leverages Groq LPU™ technology for near-instant responses (typically under 1 second).
* **🎯 Seamless Timeline Integration:**
  * Dedicated **🕵️ Account Check** button inserted cleanly on each tweet container.
  * In-depth profile scanner button integrated into profile headers.
* **🔒 100% Privacy-First (Zero Data Collection):**
  * Direct browser-to-API communication. We operate zero intermediary servers.
  * Your API key is stored strictly within your browser's local sandbox (`chrome.storage.sync`).
* **🌑 Native Dark & Dimmed Theme Support:** Clean aesthetic styled for X Dark mode (`#000000`) and Dimmed mode (`#15202b`) with vibrant cyan highlights.
* **📋 One-Click Export:** Instantly copy analysis summaries and breakdown scores to your clipboard.
* **📦 Zero Dependencies:** Built with pure Vanilla JavaScript, modern CSS, and Manifest V3 standards—no build steps or node dependencies required.

---

## Prerequisite: Free Groq API Key
This extension communicates directly with Groq's official API. You can generate a free key in less than a minute:

1. Visit [console.groq.com/keys](https://console.groq.com/keys).
2. Sign in or create a free account (supports Google, GitHub, or email).
3. Click **"Create API Key"**.
4. Enter an identifier (e.g. `X-Ray Extension`) and copy your generated key (starts with `gsk_...`).

---

## Step-by-Step Chrome Installation

1. **Download the Repository:**
   * Click the green **Code ▾** button at the top of this GitHub repository and select **Download ZIP**.
   * Unpack (extract) the downloaded ZIP archive onto your computer.

2. **Open Extensions Manager in Chrome:**
   * Open Google Chrome (or any Chromium browser: Brave, Edge, Arc, Opera).
   * Navigate to `chrome://extensions` in the address bar.

3. **Enable Developer Mode:**
   * Toggle the **Developer mode** switch in the top right corner.

4. **Load the Extension:**
   * Click the **Load unpacked** button in the top left corner.
   * Select the unzipped folder containing `manifest.json`.

5. **Pin & Configure:**
   * Click the Extensions puzzle icon in Chrome's toolbar and pin **X-Ray**.
   * Click the X-Ray icon in your toolbar, paste your Groq API key, and hit **Save**.

---

## Usage on x.com
1. Open [x.com](https://x.com) or [twitter.com](https://twitter.com).
2. Browse your feed—you will see a **🕵️ اکانت‌چک** button beneath every tweet.
3. Click the button to inspect the account's stance, credibility score, and historical behavioral profile.
4. Visit any user profile to trigger a full profile scan.

---

## Architecture & Privacy Design
* **Client-Only Architecture:** All requests originate directly from the browser's background Service Worker to `https://api.groq.com/openai/v1/chat/completions`.
* **CSP Compliant:** Conforms to strict Manifest V3 Content Security Policies. Content scripts do not initiate arbitrary external cross-domain requests.
* **No Telemetry or Tracking:** Zero tracking pixels, analytics suites, or remote configuration fetches.

---

## Troubleshooting & FAQ

#### Q: The popup says "Groq API-Key required".
Click the extension icon in your browser toolbar, enter your `gsk_...` key from [console.groq.com/keys](https://console.groq.com/keys), and click **Save**.

#### Q: The analysis button does not appear on tweets.
Ensure the page is fully loaded. If X rolls out layout modifications, perform a hard refresh (`Cmd + Shift + R` or `Ctrl + Shift + R`).

#### Q: Received "Rate limit reached (429)".
Groq provides a generous free tier. If you analyzed many tweets in rapid succession, wait 10 seconds and retry.

---

## License
Distributed under the **MIT License**. See `LICENSE` for details.
