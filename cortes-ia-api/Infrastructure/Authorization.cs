namespace Cortes;

public static class StaffRoles {
 public const string Admin="Admin";
 public const string Support="Support";
 public const string Finance="Finance";
 public const string Security="Security";

 public static readonly string[] All={Admin,Support,Finance,Security};
 public static readonly string[] UserRead={Admin,Support,Finance,Security};
 public static readonly string[] SupportAccess={Admin,Support};
 public static readonly string[] FinanceAccess={Admin,Finance};
 public static readonly string[] SecurityAccess={Admin,Security};

 public static bool IsStaff(IEnumerable<string> roles)=>roles.Any(All.Contains);
 public static bool Valid(string role)=>All.Contains(role,StringComparer.Ordinal);
}
