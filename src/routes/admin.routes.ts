import { Router } from "express";
import { AdminController } from "../controllers/admin.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../config";

const router = Router();
const adminController = new AdminController();

router.post("/login", adminController.login.bind(adminController));
router.get(
  "/accepted-documents",
  adminController.getAcceptedDocuments.bind(adminController)
);
router.get(
  "/required-documents",
  adminController.getRequiredDocuments.bind(adminController)
);


//------------------------------------------------------------------------
router.use(authenticate, authorize(UserRole.SUPERADMIN, UserRole.ADMIN));

router.post("/logout", adminController.logout.bind(adminController));

router.get(
  "/5/aml-pep-list",
  adminController.getAll_AML_PEP_List.bind(adminController)
);
router.get(
  "/5/aml-pep-rules",
  adminController.getAll_AML_PEP_Rules.bind(adminController)
);
router.post(
  "/5/insert-entities",
  adminController.insertEntity.bind(adminController)
);

router.post(
  "/5/compliance-check/:id",
  adminController.complianceCheck.bind(adminController)
);

router.post(
  "/5/compliance/:sessionId",
  adminController.completeAdminCheck.bind(adminController)
);
router.get("/5/users", adminController.getAllUsers.bind(adminController));

router.get("/get-user/:id", adminController.getUserById.bind(adminController));

router.get("/kpis", adminController.getKPIs.bind(adminController));

router.get(
  "/face-match-unmatch",
  adminController.getMatchUnmatch.bind(adminController)
);
router.get(
  "/kyc-accept-reject",
  adminController.getApprovalRates.bind(adminController)
);

router.get("/reports", adminController.getReports.bind(adminController));

router.post(
  "/accepted-documents",
  adminController.setAcceptedDocuments.bind(adminController)
);
router.post(
  "/required-documents",
  adminController.setRequiredDocuments.bind(adminController)
);

// Protected Admin Routes

// ----------------------------------------------------------------------------------

router.use(authenticate, authorize(UserRole.ADMIN));

// User Management Routes
router.get("/users", adminController.getAllUsers.bind(adminController));
router.get("/users/:id", adminController.getUserById.bind(adminController));
router.put("/users/:id", adminController.updateUser.bind(adminController));
router.delete("/users/:id", adminController.deleteUser.bind(adminController));

// KYC Session Management Routes
router.get(
  "/kyc/pending",
  adminController.getAllPendingKYCSessions.bind(adminController)
);
router.get(
  "/kyc/status/:status",
  adminController.getKYCSessionsByStatus.bind(adminController)
);
router.get(
  "/kyc/session/:id",
  adminController.getKYCSessionById.bind(adminController)
);
router.get(
  "/kyc/user/:userId",
  adminController.getKYCSessionByUserId.bind(adminController)
);
router.patch(
  "/kyc/session/:id",
  adminController.updateKYCSessionStatus.bind(adminController)
);

export default router;
