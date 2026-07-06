# Frontend Codebase Analysis & Refactoring Assessment

This report provides a comprehensive analysis of the Glinax Chatbot frontend codebase. It inventories all React source code files, identifies AI-generated comments and code bloat, identifies generic variable and function names to refactor, details the WASSCE grading system OCR/math logic and payment status logic, checks existing configurations/scripts/tests, and proposes a 5-milestone plan to safely refactor the codebase.

---

## 1. Inventory of React Source Code Files

The React codebase located under `c:\Users\DAVIDICA\Desktop\Glinax Chatbot frontend\Glinax Chatbot\frontend\src` consists of the following key directories and files:

### Root Files
* `src/main.tsx` — Application entry point, renders `<App />` within the React root.
* `src/App.tsx` — Main application layout, wraps the router with `ThemeProvider`, `AuthProvider`, and `ToastProvider`.
* `src/index.css` — Global CSS styling containing Tailwind Tailwind rules, custom animations, and theme variables.

### Pages (`src/pages/`)
1. `About.tsx` — "About Us" page detailing the mission, features, and team behind Glinax.
2. `Assessment.tsx` — Core student assessment interface, dynamic question stepping, OCR upload, and recommendation trigger.
3. `Chat.tsx` — Primary AI chatbot dialogue page, supports specific university context and message routing.
4. `ConversationHistory.tsx` — Page displaying previous chat logs, allows deleting or resuming conversations.
5. `Forms.tsx` — Portal to view and purchase university admission voucher forms.
6. `HelpSupport.tsx` — FAQ, search interface, and direct contact details/support request forms.
7. `Home.tsx` — Landing dashboard displaying current statistics, quick actions, university listings, and feature highlights.
8. `Login.tsx` — Authentication page for existing accounts.
9. `Notifications.tsx` — Real-time notification center displaying announcements, updates, and messages.
10. `Profile.tsx` — Profile page for users to update personal info, academic details, interests, and preferences.
11. `Settings.tsx` — Application settings (theme toggle, notification preferences, account deletion).
12. `Signup.tsx` — Registration page for new users.
13. `Transactions.tsx` — Log of form purchase transactions, showing amount spent, and status (Completed, Pending, Failed).
14. `Universities.tsx` — Directory of universities with search and detail modals.
15. `routes/AppRoutes.tsx` — Routing configuration defining protected and public routes using `react-router-dom`.

### Components (`src/components/`)
1. `AuthenticationModal.tsx` — Inline login/signup modal overlay for guests.
2. `ChatBot.tsx` — Embedded chatbot widget with floating bubble and quick questions.
3. `ChatBubble.tsx` — Render individual messages with support for attachments, markdown parsing, and quick suggestions.
4. `ChatSidebar.tsx` — Side pane for managing conversation history during active chat.
5. `ConversationHistory.tsx` — Sidebar widget displaying saved conversations.
6. `EmailVerificationModal.tsx` — Code-verification flow for finalizing registration/guest logins.
7. `EnhancedSearch.tsx` — Universal search bar with filtering and quick-jump matches.
8. `ErrorBoundary.tsx` — React error boundary capturing render exceptions.
9. `FormCard.tsx` — UI card component representing a university admission voucher form.
10. `GuestLimitationModal.tsx` — Banner explaining usage limits to unauthenticated users.
11. `LazyImage.tsx` — Lazy image loading helper with blur-up placeholders and error fallbacks.
12. `Navbar.tsx` — Top navigation bar with title, back button, and menu drawer actions.
13. `PaymentModal.tsx` — Mobile Money Paystack integration overlay.
14. `ProtectedRoute.tsx` — Route guard preventing unauthenticated access to pages.
15. `PullToRefreshIndicator.tsx` — Mobile pull-to-refresh spinner overlay.
16. `Sidebar.tsx` — Main application drawer containing menu navigation links and user profile status.
17. `Toast.tsx` — Individual toast notification alert.
18. `ToastContainer.tsx` — Fixed container layout managing active toast stack.

### Contexts (`src/contexts/`)
1. `AuthContext.tsx` — Manages authentication token state, login, signup, verification, and user profile sync.
2. `ConfigContext.tsx` — Syncs dynamic app features and feature-flag configs.
3. `ThemeContext.tsx` — Light/dark theme toggle and local storage persistence.

### Custom Hooks (`src/hooks/`)
1. `useAccessibility.ts` — Manages accessibility preferences (font sizes, high contrast).
2. `useApiState.ts` — Custom fetch state manager (loading, error, caching).
3. `useAutoCloseError.ts` — Automatically dismisses API error alerts after a timeout.
4. `useChat.ts` — Handles message history, active conversation state, and backend socket triggers.
5. `useForms.ts` — Manages dynamic form purchasing and fetching operations.
6. `useGlobalSearch.ts` — Handles logic for multi-entity filtering across forms and universities.
7. `useGuestLimitations.ts` — Evaluates remaining guest queries and restricts premium actions.
8. `usePerformance.ts` — Monitors component render times and image loads.
9. `usePullToRefresh.ts` — Captures touch events to refresh pages on mobile drag.
10. `useSocket.ts` — Wraps Socket.io-client event listeners for notifications and live chats.
11. `useToast.ts` — Hook exposure of global toast alerts.
12. `useUniversities.ts` — Standardized fetch hook for university directory.
13. `useUniversityChat.ts` — Scopes chat window to a specific university context.

### Services (`src/services/`)
1. `api.ts` — Base HTTP client class (`HttpClient`) and low-level API call mapping (`ApiService`).
2. `assessmentService.ts` — Generates prompt instructions, handles OCR submissions, and matches programs.
3. `configService.ts` — Caches and retrieves key-value configuration flags.
4. `contentService.ts` — Page textual definitions, faq list, terms, and policies fallback.
5. `dataService.ts` — Shared dynamic collection getter for forms, users, and transactions.
6. `formsApi.ts` — Specific API extension dealing with form deadlines and prices.
7. `mockData.ts` — Generates fake bot dialogue and user records.
8. `ocrService.ts` — Wraps `tesseract.js` for scanning result slip documents.

### Utility and Constants (`src/utils/`, `src/data/`, `src/store/`, `src/types/`)
* `src/data/constants.ts` — Comprehensive store of static assets, FAQ contents, SHS programs, and questions.
* `src/store/index.ts` — Global Zustand state store (`useAppStore`) managing notifications, transactions, conversations, and user objects.
* `src/types/index.ts` — Shared typescript type interfaces (Notification, Theme, etc.).
* `src/utils/academicYearHelper.ts` — Generates dynamic academic year labels.
* `src/utils/apiHelpers.ts` — Consolidates fetch request wrapping, timeouts, and `CacheManager`.
* `src/utils/authUtils.ts` — Decodes JWT tokens.
* `src/utils/conversationTitles.ts` — Generates chat header summaries.
* `src/utils/formatters.ts` — Formats currencies, dates, and number numbers.
* `src/utils/greetings.ts` — Time-of-day greeting generator.
* `src/utils/index.ts` — Main export hub for helpers.
* `src/utils/logger.ts` — Formatted browser console logs.
* `src/utils/markdownUtils.ts` — Custom sanitization and basic markdown parser.
* `src/utils/validation.ts` — Text input validation (emails, phone numbers, codes).

---

## 2. Locations and Examples of AI Comments & Code Bloat

The codebase contains numerous placeholders, developer-oriented `TODO` tags, and heavy fallback structures that simulate backend functions. These must be stripped and relocated:

### I. Hardcoded Mock Logic in Service Files
* **`src/services/mockData.ts` (Lines 69-354)**
  * **Description**: Contains the entire `ChatResponseGenerator` class. It performs keyword regex checks on user chat inputs (matching terms like "knust", "ug", "requirement", "fee", etc.) and outputs hardcoded answers in the browser.
  * **Example**:
    ```typescript
    if (university.includes('knust')) {
      if (userMessage.includes('program')) {
        return `At KNUST, we offer excellent programs...`;
      }
    }
    ```
  * **Action**: Delete `ChatResponseGenerator` entirely. Dialogue responses must come from the actual AI backend endpoint (`/chat/message`).
* **`src/services/assessmentService.ts` (Lines 133-283)**
  * **Description**: `generateMockRecommendations` contains extensive hardcoded recommendations objects for various universities matching keywords.
  * **Action**: Extract mock recommendations to a static asset file or remove them in favor of actual `/assessment/ai-recommendations` backend response.

### II. Massive Fallback Databases
* **`src/services/dataService.ts` (Lines 103-315)**
  * **Description**: Implements huge fallback structures (`getDefaultData`, `getDefaultDataCollection`) that define full mock databases for users, forms, transactions, and notifications.
  * **Action**: Move default definitions to `src/data/constants.ts` or a new `src/mocks/` directory. Keep the service purely as an API gateway.
* **`src/services/configService.ts` (Lines 106-293)**
  * **Description**: Boilerplate fallback configurations (`getDefaultConfig`, `getDefaultConfigsDb`).
  * **Action**: Simplify config fallbacks to read from environment variables or standard constant objects.
* **`src/services/contentService.ts` (Lines 108-333)**
  * **Description**: Heavy static HTML and textual sections (FAQ items, terms of service) embedded within the service class.
  * **Action**: Move text content to dedicated data/JSON files.

### III. AI/Mock Integration Placeholders
* **`src/services/assessmentService.ts` (Lines 2-5, 44, 131-132, 343)**
  * **Example**: `* Integration: Replace with real AI/backend service for assessment processing`
  * **Example**: `* TODO: Replace with API call to fetch questions from backend`
  * **Action**: Strip these comments. The refactoring process should clean up comments explaining what needs to be integrated.

---

## 3. Locations and Examples of Generic Variable/Function Names

Multiple files use generic names such as `data`, `res`, `tx`, `uni`, and `q`. These should be refactored to domain-specific names:

### I. Generic Parameter/Variable `data`
* **`src/services/assessmentService.ts` (Lines 60, 79, 102, 289, 302)**
  * **Example**: `async submitAssessment(data: AssessmentData)` and `craftPersonalizedMessage(data: AssessmentData)`
  * **Refactor**: Rename `data` parameter to `assessment` or `profile` (e.g. `submitAssessment(assessment: AssessmentData)`).
* **`src/components/PaymentModal.tsx` (Lines 76, 119)**
  * **Example**: `const data = await response.json();`
  * **Refactor**: Rename `data` to `paymentInitResponse` (line 76) and `verificationResponse` (line 119).
* **`src/contexts/AuthContext.tsx` (Lines 105, 145, 175, 226, 261)**
  * **Example**: `const data = await response.json();`
  * **Refactor**: Rename `data` to `authResponse`, `profileResponse`, `verificationResponse`, etc.

### II. Generic Variable `res`
* **`src/contexts/AuthContext.tsx` (Lines 174-176)**
  * **Example**: `.then(async (res) => { const data = await res.json(); ... })`
  * **Refactor**: Rename `res` to `response` and `data` to `guestSession`.

### III. Generic Iteration Variables `tx`, `uni`, `q`
* **`src/store/index.ts` (Line 390)**
  * **Example**: `rawTransactions.map((tx: any) => { ... })`
  * **Refactor**: Rename `tx` to `rawTx` or `rawTransaction`.
* **`src/services/formsApi.ts` (Line 65)**
  * **Example**: `response.data.map(uni => ({ ... }))`
  * **Refactor**: Rename `uni` to `university`.
* **`src/store/index.ts` (Line 382)**
  * **Example**: `UNIVERSITIES_DATA.map(uni => ({ ... }))`
  * **Refactor**: Rename `uni` to `university`.
* **`src/services/assessmentService.ts` (Line 50)**
  * **Example**: `ASSESSMENT_QUESTIONS.map(q => ({ ... }))`
  * **Refactor**: Rename `q` to `question`.

---

## 4. Preservation of Core Logic (WASSCE & Payments)

To prevent breaking critical student profiling and transaction flows, the following logic blocks must be **strictly preserved** and verified by tests:

### I. WASSCE Grading System Math & OCR Logic
* **Location**: `src/services/ocrService.ts` (Lines 3-80, function `parseWassceResult`)
* **Location**: `src/pages/Assessment.tsx` (Lines 46-77, inside `handleOcrUpload`)
* **Logic Map**:
  1. **Subject Extraction**: Lines 10-44 in `ocrService.ts` define `parseLineForSubject(line)`. It uses substring matching (`line.includes(...)`) to map dirty OCR text lines to standardized names (e.g. `elective` or `further` -> `Elective Mathematics`, `math` -> `Core Mathematics`, `english` -> `English Language`, etc.).
  2. **Grade Extraction**: Regex `line.match(/\b([a-f][1-9]|82|83|41|al|c0|c8|04|05|06|d1|e3|e8|f9|ca|cb|co)\b/i)` extracts grades.
  3. **OCR Typo Corrections**: Common scanner issues are mapped to correct grades:
     * `82` -> `B2`
     * `83` -> `B3`
     * `41` / `AL` -> `A1`
     * `C0` / `C8` / `06` / `CB` / `CO` -> `C6`
     * `04` / `CA` -> `C4`
     * `05` -> `C5`
     * `D1` -> `D7`
  4. **Subject Count Guard**: In `Assessment.tsx` (line 54), if the length of detected grades is `< 8`, it raises a warning advising the student to fill in missing subjects manually.
* **Refactoring Constraint**: The keyword dictionaries, corrections list, and matching regexes must remain functional without modification, as they are calibrated for the OCR output.

### II. Payment Status & Polling Logic
* **Location**: `src/components/PaymentModal.tsx` (Lines 38-93, `initializePayment`; lines 103-154, `startPaymentVerification`)
* **Location**: `src/store/index.ts` (Lines 366-418, `loadTransactions`)
* **Logic Map**:
  1. **Initialization**: Calls `/payments/initialize` sending standard amount parsing (stripping non-numbers/dots).
  2. **Redirect**: Safely opens the generated `authorization_url` on Paystack's server.
  3. **Polling verification**: Initiates polling on GET `/payments/verify/${ref}`. It implements a retry timeout (checks every 5 seconds, up to 20 attempts).
  4. **Status Checking**: Extracts status using `data?.data?.status || data?.status`. Maps `success` to complete, and `failed` to error.
  5. **Transaction Status Normalization**: In `loadTransactions` (lines 394-396), maps raw database transaction status strings into three strict statuses: `completed` (from `success`/`successful`), `failed` (from `failed`), or `pending`.
* **Refactoring Constraint**: The Paystack integration, timeout parameters, and status mappings must remain unchanged to ensure mobile money transactions resolve correctly.

---

## 5. Build/Test Scripts & Configurations

An audit of files in the workspace root and the `frontend` folder reveals the following configurations:

### I. Build and Test Scripts
* Located in `frontend/package.json` under `"scripts"`:
  * `"build": "tsc -b && vite build"` — standard production build compiler.
  * `"build:analyze": "tsc -b && vite build --mode analyze"` — bundle analyzer build.
  * `"type-check": "tsc --noEmit"` — TypeScript compilation check.
* **Test Suite**: There are **no testing dependencies** (e.g. Jest, Vitest, Cypress) and **no test files** (e.g. `*.test.tsx`, `*.spec.ts`) in the workspace. No test suite currently exists.

### II. ESLint Configuration
* Located in `frontend/eslint.config.js`:
  * Configures global ignores on `dist`.
  * Target files: `**/*.{ts,tsx}`.
  * Extends: `js.configs.recommended`, `tseslint.configs.recommended`, `reactHooks.configs['recommended-latest']`, and `reactRefresh.configs.vite`.
  * Runs browser global globals.

### III. Prettier Configuration
* Prettier dependency `prettier` is installed in `package.json` (`^3.2.5`).
* Custom config files (like `.prettierrc` or `.prettierignore`) **do not exist**. Prettier uses standard defaults during formatting scripts.

---

## 6. Recommendation for Decomposing the Refactoring Task

To safely refactor the codebase without breaking the existing functionality, we recommend executing the work in **5 logical milestones**:

### Milestone 1: Project Setup, Linting, & Testing Environment
* **Scope**: Install and configure the tooling necessary to run verify commands.
* **Tasks**:
  * Set up Vitest and React Testing Library dev dependencies in `package.json`.
  * Create `.prettierrc` and `.prettierignore` files to align styling rules.
  * Clean up package.json script definitions.
* **Verification**: Verify that `npm run type-check` and `npm run lint` compile successfully.

### Milestone 2: Baseline Test Suite for Core Mathematical & Polling Logic
* **Scope**: Secure the core logics before refactoring.
* **Tasks**:
  * Write unit tests for `parseWassceResult` (OCR text parsing, subject mappings, typo corrections) under `src/services/ocrService.ts`.
  * Write unit tests for Paystack polling triggers and status normalizer mappings inside `src/store/index.ts` and `PaymentModal.tsx`.
* **Verification**: Run `vitest run` and confirm all baseline tests pass with 100% success.

### Milestone 3: Mock Data Isolation & Bloat Reduction
* **Scope**: Strip out large default databases and client-side chat generators.
* **Tasks**:
  * Delete `ChatResponseGenerator` class in `src/services/mockData.ts`.
  * Relocate default configs, content, and dynamic collection states out of `dataService.ts`, `configService.ts`, and `contentService.ts` into a dedicated mock directory or constants file.
  * Strip out AI development placeholders (comments starting with `TODO: Replace with...` or `// Will be replaced by...`).
* **Verification**: Run `npm run type-check` to verify no broken imports, and run the test suite.

### Milestone 4: Variable & Parameter Naming Standardisation
* **Scope**: Improve codebase clarity by renaming generic identifiers.
* **Tasks**:
  * Replace instances of `data` (as variables/parameters) with domain-specific names (`assessmentData`, `paymentInitResponse`, `authResponse`) in `assessmentService.ts`, `PaymentModal.tsx`, `AuthContext.tsx`.
  * Replace loops and mapping variables `tx`, `uni`, `q` with `transaction`, `university`, and `question`.
* **Verification**: Run the test suite and verify `npm run build` succeeds.

### Milestone 5: API Layer Consolidation
* **Scope**: Streamline API requests and clean up smart fallbacks.
* **Tasks**:
  * Refactor services to consistently route through the `apiCall` helper in `src/utils/apiHelpers.ts` instead of duplicating fetch timeouts and auth header extractions.
  * Clean up unused imports and verify that the application has zero TypeScript warnings.
* **Verification**: Build the application using `npm run build` and run all unit tests.
