import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErpLoader } from "../shared/ErpLoader";
import { useAuth } from "./auth-context";
import { isOwnerUsername } from "./owner.util";

/** Hidden spectator console — institution owner (kar974) only. */
export function OwnerRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <ErpLoader fullScreen />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isOwnerUsername(user.username)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
