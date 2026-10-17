# TMS
## Firebase / AI setup
The web app is configured for Firebase project `taj-medical-store-9a3ad` using the Firebase Web App configuration supplied for this project. Firebase Authentication providers (Email/Password, Google, and Anonymous for customer chat) must be enabled in the Firebase Console, and the included `firestore.rules` / `firestore.indexes.json` must be deployed.

The AI assistant uses the configured Google/Firebase API key with the Gemini `gemini-2.5-flash` Generative Language API. The key is browser-visible by design for a client-side app, so restrict it in Google Cloud/API-key settings to the required APIs and allowed web origins. The Generative Language API must be enabled for AI replies to work.


## Integrated online shop and promotions

- The supplied `tms-store.html` has been installed as `catalogues/shop.html`, within the same site. Main-site catalogue promotions and the admin shop shortcut point to this page.
- The shop now uses the same Firebase project as the main TMS website. Shop inventory/settings are read from `tms_store`; orders are stored as individual documents in `tms_orders` so one customer cannot overwrite the whole order list.
- Admin → Popup & Ads supports a custom HTML/CSS/JavaScript promotion editor with a sandboxed preview. The saved code is stored with `siteData/main` through the existing Firebase sync.
- Publish `firestore.rules` before testing. Firebase Authentication must have Anonymous and Email/Password sign-in enabled. Admin identity is restricted to `farhanalipervez@gmail.com`.
- The custom popup code runs in a sandboxed iframe; it can render its own design and links but cannot directly access the parent page's Firebase session. Firebase sync applies to the saved promotion settings.


## Unified catalogue / full shop (v10 integration)

- `tms_store/products` is the shared live inventory for both the main site's **Medicine Catalogue** and `catalogues/shop.html` (Full Shop).
- Product edits made in the Full Shop update the main catalogue live. Main Admin stock saves are mirrored back to `tms_store/products`, preserving richer shop fields where possible. Product IDs are retained so links/cart items remain consistent.
- Firestore rules are in `firestore.rules`. Publish these rules in Firebase Console → Firestore Database → Rules (or deploy with Firebase CLI from this folder). Rules are not published to your live Firebase project automatically by editing this ZIP.
- Restock requests now use private `tms_stockAlerts` documents instead of a publicly-readable array containing customer phone numbers.
- Customer order records remain private to the customer account and admin. Group chat remains disabled.

After uploading, test by adding/editing a product in the Full Shop admin and confirming it appears in the main catalogue; then edit stock in the main Admin and confirm it updates in the Full Shop.
