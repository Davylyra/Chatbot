## 2026-07-06T16:15:23Z
You are the Worker Agent for Milestone 4: Variable & Parameter Naming Standardization.
Your working directory is: c:\Users\DAVIDICA\Desktop\Glinax Chatbot frontend\Glinax Chatbot\.agents\worker_milestone4\
The project workspace root is: c:\Users\DAVIDICA\Desktop\Glinax Chatbot frontend\Glinax Chatbot\
The frontend codebase is located at: c:\Users\DAVIDICA\Desktop\Glinax Chatbot frontend\Glinax Chatbot\frontend

Your task is to rename generic variables and parameters to highly contextual, domain-specific names across the codebase while preserving 100% functionality.
Specifically:
1. In `frontend/src/services/assessmentService.ts`, rename generic parameter `data` (e.g. in `submitAssessment(data)`, `craftPersonalizedMessage(data)`) to `assessment` or `assessmentData`. Rename loop variables `q` to `question`.
2. In `frontend/src/components/PaymentModal.tsx`, rename generic variables `data` inside network callbacks to `paymentInitResponse` (in `initializePayment`) and `verificationResponse` (in `startPaymentVerification`).
3. In `frontend/src/contexts/AuthContext.tsx`, rename generic network callback variables `data` and `res` to domain-specific names like `authResponse`, `profileResponse`, `verificationResponse`, and `response`.
4. In `frontend/src/store/index.ts`, rename generic iteration variable `tx` inside `loadTransactions` (e.g. `rawTransactions.map((tx: any) => ...)`) to `rawTx` or `rawTransaction`. Rename `uni` in map/loop callbacks to `university`.
5. In `frontend/src/services/formsApi.ts`, rename generic iteration variable `uni` in map/loop callbacks to `university`.
6. Scan the rest of the codebase and replace any other occurrences of generic variables `data`, `res`, `tx`, `uni`, or `q` with descriptive names where they hinder readability.
7. If your changes affect the tests in `frontend/src/__tests__/payment.test.ts` or others, update the tests to align with the renamed variables.
8. Verify everything works by running `npm run type-check` and `npm run test` inside `frontend/` and confirming all tests pass.

Make sure to document all your changes, files modified, renamed variables, commands, and outputs in a report at `c:\Users\DAVIDICA\Desktop\Glinax Chatbot frontend\Glinax Chatbot\.agents\worker_milestone4\handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Once completed, write the handoff report and send a message back to the parent (conversation ID: 63d02208-ff15-43b3-8826-498fecfdbbc4).
