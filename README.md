# AZARO — Own Your Style | HTML/CSS/JS + Firebase

This is the PHP/XAMPP AZARO fashion store converted to a static GitHub/Vercel-friendly frontend using Firebase Authentication + Cloud Firestore. The visual language, buyer shopping flow, cart, profile, order history, reviews, discounts, promotional popup and staff dashboard are retained and polished.

## 1. Create Firebase
1. Open https://console.firebase.google.com/ and create a project named AZARO (or any name).
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. In **Firestore Database**, create a database in production mode.
4. In **Project settings → Your apps**, add a **Web app** and copy its config.
5. Open `firebase-config.js` and replace the `YOUR_...` values.
6. In Firestore Rules, paste the contents of `firestore.rules` and publish.

## 2. Create the first admin
Firebase registration intentionally creates buyers only. This prevents a visitor from making themselves admin.
1. Open the site and register your own account.
2. In Firebase Console → Firestore → `users`, open that user's document (the document ID is the Firebase Auth UID).
3. Change `role` from `buyer` to `admin` and keep the other fields.
4. Refresh the site. The Dashboard menu will appear.
5. From the admin dashboard you can add moderators, categories and products.

## 3. Seed the demo catalog
The admin dashboard contains **Seed demo catalog** when there are no products. It creates the same core fashion categories and sample products as the original PHP project: Shirts, Pants, Trousers, Combo, New Arrivals and Essentials.

## 4. Run locally
Do NOT open `index.html` with `file://` because Firebase modules/auth can be blocked by browser security.

Easy option: install VS Code → Live Server extension → right-click `index.html` → **Open with Live Server**.

Or use Python:
`python -m http.server 5500`
Then open `http://localhost:5500`.

## 5. Run from GitHub
### GitHub Pages
1. Upload the project contents to a GitHub repository.
2. Repository → Settings → Pages → Deploy from branch → `main` / root.
3. Add your GitHub Pages domain in Firebase Console → Authentication → Settings → Authorized domains.
4. Open the GitHub Pages URL.

### Vercel / Netlify
Import the GitHub repository. No build command is required; the site is static.

## 6. Products and images
Product records are stored in Firestore. Existing product images from the original project remain in `assets/` and `uploads/products/` so the visual catalog can be reused. New products can use an image URL. This keeps the project fully static and avoids a PHP upload endpoint.

For profile pictures, the browser resizes the selected image and stores a compact data URL in the user's Firestore profile, so no separate server upload is required.

## 7. Welcome email after registration
A browser-only app cannot safely send Gmail SMTP directly. The project includes an optional EmailJS hook in `firebase-config.js` for a welcome email. If you want it, create an EmailJS template and fill `publicKey`, `serviceId`, and `templateId`. If these are blank, registration still works normally.

For a production-grade email system, use Firebase Trigger Email / Cloud Functions rather than putting SMTP credentials in frontend code.

## 8. Invoice
Invoices are generated as a premium HTML invoice in a print view. Buyers can click **Print / Save PDF** and choose **Save as PDF** in the browser. This is the secure static equivalent of the old PHP PDF endpoint.

## 9. Important security note
Never put a Gmail password, SMTP App Password, Firebase Admin SDK key, service account JSON, or other secret credential in this repository. Firebase Web API keys are identifiers, not admin secrets; Firestore Rules are the security boundary.

## 10. Roles
- `buyer`: storefront, cart, checkout, profile, order history, reviews.
- `moderator`: dashboard, products, categories, orders, customers and reports.
- `admin`: moderator capabilities plus user-role management and management tools.

## 11. Order filters
Orders support: **Incoming**, **Sent to courier**, **Delivered**, **Returned**. The dashboard uses the same terminology as the requested AZARO workflow.
