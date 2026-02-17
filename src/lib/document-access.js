function asString(value) {
  if (typeof value === "string") return value;
  if (value?.toString) return value.toString();
  return "";
}

export function hasAccessToDocument(doc, userToken) {
  if (!doc || !userToken?.sub) return false;

  const uploadedBy = asString(doc.uploadedBy);

  // User always has access to their own private documents.
  if (doc.isPrivate && uploadedBy === userToken.sub) {
    return true;
  }

  // Never expose private docs to other users.
  if (doc.isPrivate) {
    return false;
  }

  const docLevel = doc.hierarchyLevel ?? 3; // Default: everyone.
  const userRole = userToken.role?.toLowerCase?.() || "general";

  // Level 0: Admin only.
  if (docLevel === 0) {
    return userRole === "admin";
  }

  // Level 1: Admin and PR manager.
  if (docLevel === 1) {
    return userRole === "admin" || userRole === "pr_manager";
  }

  // Level 2: Department/role scoped.
  if (docLevel === 2) {
    if (Array.isArray(doc.accessRoles) && doc.accessRoles.length > 0) {
      const userDepartments = Array.isArray(userToken.departments)
        ? userToken.departments
        : [];
      const hasMatchingDept = userDepartments.some(
        (dept) =>
          typeof dept === "string" &&
          doc.accessRoles.includes(dept) &&
          dept.toLowerCase() !== "admin",
      );
      return hasMatchingDept || userRole === "admin";
    }

    return userRole !== "general" || userRole === "admin";
  }

  // Level 3: Everyone.
  return true;
}

