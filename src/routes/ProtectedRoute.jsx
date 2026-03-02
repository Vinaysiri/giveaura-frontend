import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GiveAuraLoader from "../components/GiveAuraLoader";

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <GiveAuraLoader />;
  }

  if (!currentUser) {
    // store where user was going, so after login they return there
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
