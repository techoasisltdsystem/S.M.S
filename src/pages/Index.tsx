import { useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";

const Index = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Login />;
  }

  // Redirect handled by App.tsx routes, but fallback to login
  return <Login />;
};

export default Index;
