import { createContext, ReactNode, useCallback, useContext, useMemo } from "react";
import { NavigateOptions, useNavigate } from "react-router-dom";

export function resolveStudentHref(href: string, basePath: string) {
  return href.replace(/^\/students(?=\/|$)/, basePath);
}

type StudentPortalContextValue = {
  basePath: string;
  variant: "admin" | "teacher";
  homeTitle: string;
  api: {
    searchPath: string;
    createPath: string;
    detailPath: (id: string) => string;
    updatePath: (id: string) => string;
    archivePath: (id: string) => string;
    catalogPath: string | null;
  };
};

const ADMIN_VALUE: StudentPortalContextValue = {
  basePath: "/students",
  variant: "admin",
  homeTitle: "Students",
  api: {
    searchPath: "/api/students/search",
    createPath: "/api/students",
    detailPath: (id) => `/api/students/${id}`,
    updatePath: (id) => `/api/students/${id}`,
    archivePath: (id) => `/api/students/${id}`,
    catalogPath: null
  }
};

const TEACHER_VALUE: StudentPortalContextValue = {
  basePath: "/teacher/students",
  variant: "teacher",
  homeTitle: "Add Student",
  api: {
    searchPath: "/api/portals/teacher/students/manage",
    createPath: "/api/portals/teacher/students/manage",
    detailPath: (id) => `/api/portals/teacher/students/manage/${id}`,
    updatePath: (id) => `/api/portals/teacher/students/manage/${id}`,
    archivePath: (id) => `/api/portals/teacher/students/manage/${id}`,
    catalogPath: "/api/portals/teacher/structure"
  }
};

const StudentPortalContext = createContext<StudentPortalContextValue>(ADMIN_VALUE);

export function StudentPortalProvider({
  variant,
  children
}: {
  variant: "admin" | "teacher";
  children: ReactNode;
}) {
  const value = useMemo(() => (variant === "teacher" ? TEACHER_VALUE : ADMIN_VALUE), [variant]);
  return <StudentPortalContext.Provider value={value}>{children}</StudentPortalContext.Provider>;
}

export function useStudentPortal() {
  return useContext(StudentPortalContext);
}

export function useStudentPaths() {
  const { basePath } = useStudentPortal();
  return {
    home: basePath,
    add: `${basePath}/add-student`,
    modify: `${basePath}/modify-student`,
    delete: `${basePath}/delete-student`,
    existingRecords: `${basePath}/existing-records`,
    history: `${basePath}/history`
  };
}

export function useStudentNavigate() {
  const navigate = useNavigate();
  const { basePath } = useStudentPortal();
  return useCallback(
    (to: number | string, options?: NavigateOptions) => {
      if (typeof to === "number") return navigate(to);
      return navigate(resolveStudentHref(to, basePath), options);
    },
    [navigate, basePath]
  );
}
