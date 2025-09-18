import { Request, Response, NextFunction } from "express";
import { AdminService } from "../services/admin.service";
import { ApiError } from "../utilities/ApiError";
import { AML_PEP_Rules, Status, StatusCode, UserRole } from "../config";
import { ApiResponse } from "../utilities/ApiResponse";
import { checkCompliance } from "../utilities/ruleEngine";
import { UserService } from "../services/user.service";
import { asyncHandler } from "../utilities/AsyncHandler";
import { profile } from "console";
import { formatTime_ms_string } from "../utilities/formatDate";
const accessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 24 * 60 * 60 * 1000,
});

const refreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days - match JWT expiry
});
export class AdminController {
  private adminService: AdminService;

  constructor() {
    this.adminService = new AdminService();
  }

  login = asyncHandler(async (req: Request, res: Response) => {
    const { gtm, gretoken } = req.body;

    if (!gtm && !gretoken) {
      console.log("[Controller] no gretoken in body");
    }
    const { user, tokens } = await this.adminService.login(req.body, gretoken);

    res.cookie("accessToken", tokens.accessToken, accessTokenCookieOptions());
    res.cookie(
      "refreshToken",
      tokens.refreshToken,
      refreshTokenCookieOptions()
    );

    console.log("ADMIN login successfull");

    res
      .status(200)
      .json(new ApiResponse(200, { user, tokens }, "Login successful"));
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.id) {
      await this.adminService.logout(req.user.id);
    }

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.status(200).json(new ApiResponse(200, null, "ADMIN Logout successful"));
  });

  public async getAllUsers(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await this.adminService.getAllUsers__();

      res.status(200).json(result?.users);
    } catch (error) {
      next(error);
    }
  }

  public async getUserById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.params.id;
      const user = await this.adminService.getUserById(userId);
      if (user) {
        res.status(200).json(user);
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      next(error);
    }
  }

  public async updateUser(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.params.id;
      const userData = req.body;
      const updatedUser = await this.adminService.updateUser(userId, userData);
      if (updatedUser) {
        res.status(200).json(updatedUser);
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      next(error);
    }
  }

  public async deleteUser(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.params.id;
      const success = await this.adminService.deleteUser(userId);
      if (success) {
        res.status(204).send(); // No Content
      } else {
        res.status(404).json({ message: "User not found" });
      }
    } catch (error) {
      next(error);
    }
  }

  public async getAllPendingKYCSessions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sessions = await this.adminService.getAllPendingKYCSessions();
      res.status(200).json(sessions);
    } catch (error) {
      next(error);
    }
  }

  public async getKYCSessionsByStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = req.params.status as any;
      const sessions = await this.adminService.getAllKYCSessionsByStatus(
        status
      );
      res.status(200).json(sessions);
    } catch (error) {
      next(error);
    }
  }

  public async getKYCSessionById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sessionId = req.params.id;
      const session = await this.adminService.getKYCSessionById(sessionId);
      if (session) {
        res.status(200).json(session);
      } else {
        res.status(404).json({ message: "KYC Session not found" });
      }
    } catch (error) {
      next(error);
    }
  }

  public async getKYCSessionByUserId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.params.userId;
      const session = await this.adminService.getKYCSessionByUserId(userId);
      if (session) {
        res.status(200).json(session);
      } else {
        res
          .status(404)
          .json({ message: "KYC Session not found for this user" });
      }
    } catch (error) {
      next(error);
    }
  }

  public async updateKYCSessionStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sessionId = req.params.id;
      const { status } = req.body;

      const updatedSession = await this.adminService.updateKYCSessionStatus(
        sessionId,
        status
      );

      if (updatedSession) {
        res.status(200).json(updatedSession);
      } else {
        res.status(404).json({ message: "KYC Session not found" });
      }
    } catch (error) {
      next(error);
    }
  }

  public async getAll_AML_PEP_List(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const list = await this.adminService.getAll_AML_PEP_List();

      res
        .status(StatusCode.SUCCESS)
        .json(new ApiResponse(StatusCode.SUCCESS, list));
    } catch (e: any) {
      console.log(e.message);
      next(e);
      throw new ApiError(StatusCode.INTERNAL_SERVER_ERROR, e.message);
    }
  }

  public async getAll_AML_PEP_Rules(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    res
      .status(StatusCode.SUCCESS)
      .json(new ApiResponse(StatusCode.SUCCESS, AML_PEP_Rules));
  }

  public async insertEntity(req: Request, res: Response) {
    try {
      const data = req.body; // expecting an array of JSON objects
      if (!Array.isArray(data)) {
        return res
          .status(400)
          .json({ message: "Request body must be an array of objects" });
      }

      const saved = await this.adminService.insertEntities(data);
      res
        .status(201)
        .json({ message: "Data inserted successfully", data: saved });
    } catch (error: any) {
      console.error("Insert error:", error);
      res
        .status(500)
        .json({ message: "Failed to insert data", error: error.message });
    }
  }

  public async complianceCheck(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!id) {
        console.log("User ID is required!");
        throw new ApiError(StatusCode.BAD_REQUEST, "User ID is required!");
      }

      const user = await this.adminService.getUserById(id);

      if (!user) {
        console.log("User not found with the given ID!");
        throw new ApiError(
          StatusCode.NOT_FOUND,
          "User not found with the given ID!"
        );
      }

      const list = await this.adminService.getAll_AML_PEP_List();

      const compliance_result = checkCompliance(user, list);

      console.log(
        "\n\n----------------------------------- \nCOMPLIANCE RESULT  \t:\t",
        compliance_result,
        "\n-----------------------------------\n"
      );

      res.status(StatusCode.SUCCESS).json(
        new ApiResponse(StatusCode.SUCCESS, {
          compliance: compliance_result,
          user: user,
        })
      );
    } catch (e: any) {
      console.log(e.message);
      throw new ApiError(StatusCode.INTERNAL_SERVER_ERROR, e.message);
    }
  }

  // Admin - Complete compliance check
  completeAdminCheck = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { userId, decision, notes } = req.body;

    // Validate decision
    if (!["approved", "rejected"].includes(decision)) {
      res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Decision must be either 'approved' or 'rejected'"
          )
        );
      return;
    }

    if (!userId) {
      res.status(400).json(new ApiResponse(400, null, "User ID is required"));
      return;
    }

    const result = await this.adminService.completeComplianceCheck(
      userId,
      sessionId,
      req.user!.id, // Admin ID
      decision,
      notes
    );

    res
      .status(200)
      .json(new ApiResponse(200, result, `KYC ${decision} successfully`));
  });

  // Admin - Get all pending compliance checks
  getPendingComplianceChecks = asyncHandler(
    async (req: Request, res: Response) => {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await this.adminService.getAllUsers(page, limit);

      const pendingUsers = result.users.filter(
        (user) => user.currentStage === 6
      ); // COMPLIANCE_CHECK = 6

      res.status(200).json(
        new ApiResponse(
          200,
          {
            users: pendingUsers,
            pagination: {
              page,
              limit,
              total: pendingUsers.length,
              totalPages: Math.ceil(pendingUsers.length / limit),
            },
          },
          "Pending compliance checks retrieved successfully"
        )
      );
    }
  );

  // Admin - Get KYC analytics/statistics
  getKYCAnalytics = asyncHandler(async (req: Request, res: Response) => {
    const allUsers = await this.adminService.getAllUsers(1, 1000);

    const analytics = {
      totalUsers: allUsers.total,
      verifiedUsers: allUsers.users.filter((user) => user.Verified).length,
      stageDistribution: {
        notStarted: allUsers.users.filter((user) => user.currentStage === 0)
          .length,
        documentUpload: allUsers.users.filter((user) => user.currentStage === 1)
          .length,
        documentProcessing: allUsers.users.filter(
          (user) => user.currentStage === 2
        ).length,
        livenessCheck: allUsers.users.filter((user) => user.currentStage === 3)
          .length,
        faceVerification: allUsers.users.filter(
          (user) => user.currentStage === 4
        ).length,
        videoKYC: allUsers.users.filter((user) => user.currentStage === 5)
          .length,
        complianceCheck: allUsers.users.filter(
          (user) => user.currentStage === 6
        ).length,
        completed: allUsers.users.filter((user) => user.currentStage === 7)
          .length,

        rejected: allUsers.users.filter((user) => user.currentStage === 8)
          .length,
        failed: allUsers.users.filter((user) => user.currentStage === 9).length,
      },
      completionRate: (
        (allUsers.users.filter((user) => user.currentStage === 7).length /
          allUsers.total) *
        100
      ).toFixed(2),
      rejectionRate: (
        (allUsers.users.filter((user) => user.currentStage === 8).length /
          allUsers.total) *
        100
      ).toFixed(2),
    };

    res
      .status(200)
      .json(
        new ApiResponse(200, analytics, "KYC analytics retrieved successfully")
      );
  });

  //----------------------------------------------------------------------------

  getKPIs = asyncHandler(async (req: Request, res: Response) => {
    const TotalKYCs = await this.adminService.getAllKYCSessions();

    const completedKYCs = TotalKYCs.filter(
      (session) => session.status === Status.COMPLETED
    );

    const rejectedKYCs = TotalKYCs.filter(
      (session) => session.status === Status.REJECTED
    );

    const TAT = completedKYCs
      .map((session) => {
        const createdAt = session.createdAt;
        const completedAt = session.completedAt;
        if (createdAt && completedAt && completedAt > createdAt) {
          const timeDiff =
            new Date(completedAt).getTime() - new Date(createdAt).getTime();
          if (timeDiff < 0) {
            console.error(`Inconsistent timestamps for session ${session.id}`);
            throw new ApiError(
              StatusCode.INTERNAL_SERVER_ERROR,
              `Inconsistent timestamps for session ${session.id}`
            );
          }

          return timeDiff;
        }
        return undefined;
      })
      .filter((t) => typeof t === "number");

    const avgTAT =
      TAT.length > 0
        ? TAT.reduce((acc, curr) => acc + curr, 0) / TAT.length
        : 0;

    const duration = formatTime_ms_string(avgTAT);
    const rejectionRate = (rejectedKYCs?.length / TotalKYCs?.length) * 100 || 0;

    const totalFaceMatch = TotalKYCs.map((session) => session.EPIC2?.data);

    const FaceMatchScore =
      totalFaceMatch.length > 0
        ? (totalFaceMatch.filter((data) => data && data?.isMatch === true)
            .length /
            totalFaceMatch.length) *
          100
        : 0;

    const KPIs = {
      "Total KYCs": completedKYCs.length,
      "Average TAT": duration,
      "Rejection Rate": `${rejectionRate.toFixed(2)} %`,
      "Face Match Score": `${FaceMatchScore.toFixed(2)} %`,
    };

    res
      .status(200)
      .json(new ApiResponse(200, KPIs, "KPI metrics retrieved successfully"));
  });

  getMatchUnmatch = asyncHandler(async (req: Request, res: Response) => {
    const match = 60;
    const unmatch = 40;
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { match, unmatch },
          "Match-Unmatch face data  retrieved successfully"
        )
      );
  });

  getApprovalRates = asyncHandler(async (req: Request, res: Response) => {
    const approved = [70, 75, 80, 78, 85, 90, 88];
    const rejected = [30, 25, 20, 22, 15, 10, 12];
    const labels = ["10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM"];
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { data: { approved, rejected }, labels },
          "Hourly based data of the day"
        )
      );
  });

  getReports = asyncHandler(async (req: Request, res: Response) => {
    const { from, to, type, dataSource } = req.query;

    console.log("Report request params:", { from, to, type, dataSource });
    // console.log("Type of 'from':", typeof from);
    // console.log("Type of 'to':", typeof to);

    if (!from || !to) {
      res
        .status(400)
        .json(new ApiResponse(400, null, "'from' and 'to' dates are required"));
      return;
    }

    if (!dataSource) {
      res
        .status(400)
        .json(new ApiResponse(400, null, "Data source is required"));
      return;
    }

    if (!type) {
      res
        .status(400)
        .json(new ApiResponse(400, null, "Report type is required"));
      return;
    }

    // if (from && to && new Date(from as string) >= new Date(to as string)) {
    //   res
    //     .status(400)
    //     .json(
    //       new ApiResponse(
    //         400,
    //         null,
    //         "'from' date cannot be later than or equal to 'to' date"
    //       )
    //     );
    //   return;
    // }

    const fromDate = from ? new Date(from as string) : undefined;
    const toDate = to ? new Date(to as string) : undefined;

    console.log("Parsed dates:", { fromDate, toDate });
    const validTypes = ["tabular", "chart"];
    if (type && !validTypes.includes(type as string)) {
      res
        .status(400)
        .json(
          new ApiResponse(400, null, `Invalid type. Valid types: ${validTypes}`)
        );
      return;
    }

    const validDataSources = ["KYC Records", "Users", "Audit Logs"];
    if (dataSource && !validDataSources.includes(dataSource as string)) {
      res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            `Invalid dataSource. Valid options: ${validDataSources}`
          )
        );
      return;
    }

    let res_data: { data: any[]; count: number[]; labels: any[] } = {
      data: [],
      count: [],
      labels: [],
    };
    if (dataSource === "KYC Records") {
      res_data = await this.adminService.getAllKYCSessionsByFilters(
        fromDate,
        toDate
      );
    } else if (dataSource === "Users") {
      res_data = await this.adminService.getAllUsersByFilter(fromDate, toDate);
    } else if (dataSource === "Audit Logs") {
      res_data = { data: [], count: [], labels: [] };
    }

    res.status(StatusCode.SUCCESS).json(
      new ApiResponse(
        StatusCode.SUCCESS,
        {
          data: type === "chart" ? res_data.count : res_data.data,
          labels: type === "chart" ? res_data.labels : "",
          type,
          source: dataSource,
        },
        "Report data retrieved successfully"
      )
    );
  });

  //-------------ADMIN CONFIGURATION MANAGEMENT----------------
  getAcceptedDocuments = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.adminService.getAcceptedDocuments();

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Accepted documents retrieved successfully"
        )
      );
  });

  // GET /admin/required-documents
  getRequiredDocuments = asyncHandler(async (req: Request, res: Response) => {
    const result = await this.adminService.getRequiredDocuments();

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Required documents retrieved successfully"
        )
      );
  });

  // PUT /admin/accepted-documents
  setAcceptedDocuments = asyncHandler(async (req: Request, res: Response) => {
    console.log("Request body for accepted documents:", req.body);
    const acceptedConfig = req.body;

    // Validate required structure
    if (!acceptedConfig || !acceptedConfig.documents) {
      res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Invalid format. Expected: { documents: { aadhar: boolean, pan: boolean, ... } }"
          )
        );
      return;
    }

    const updatedBy = "ADMIN";

    await this.adminService.setAcceptedDocuments(acceptedConfig, updatedBy);

    res
      .status(200)
      .json(
        new ApiResponse(200, null, "Accepted documents updated successfully")
      );
  });

  // PUT /admin/required-documents
  setRequiredDocuments = asyncHandler(async (req: Request, res: Response) => {
    const requiredConfig = req.body;

    // Validate required structure
    if (!requiredConfig || !requiredConfig.documents) {
      res
        .status(400)
        .json(
          new ApiResponse(
            400,
            null,
            "Invalid format. Expected: { count: number, documents: { aadhar: boolean, pan: boolean, ..., any: boolean } }"
          )
        );
      return;
    }

    const updatedBy = "ADMIN";

    await this.adminService.setRequiredDocuments(requiredConfig, updatedBy);

    res
      .status(200)
      .json(
        new ApiResponse(200, null, "Required documents updated successfully")
      );
  });
}
