import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';

// Pages (to be created)
import Home from '../pages/buyer/Home';
import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Signup';
import ProductDetails from '../pages/buyer/ProductDetails';
import Cart from '../pages/buyer/Cart';
import Checkout from '../pages/buyer/Checkout';
import BNPLApplication from '../pages/buyer/BNPLApplication';
import OrderTracking from '../pages/buyer/OrderTracking';
import Analytics from '../pages/buyer/Analytics';
import DowryWizard from '../pages/buyer/DowryWizard';

// Seller Pages
import SellerDashboard from '../pages/seller/SellerDashboard';
import ProductUpload from '../pages/seller/ProductUpload';

// Admin Pages
import AdminDashboard from '../pages/admin/AdminDashboard';
import UserManagement from '../pages/admin/UserManagement';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="h-screen flex items-center justify-center text-primary font-serif italic">Loading ShaadiSahulat...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/home" replace />;

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<Home />} />
        <Route path="product/:id" element={<ProductDetails />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        
        {/* Buyer Protected Routes */}
        <Route path="cart" element={<ProtectedRoute allowedRoles={['buyer', 'admin']}><Cart /></ProtectedRoute>} />
        <Route path="checkout" element={<ProtectedRoute allowedRoles={['buyer', 'admin']}><Checkout /></ProtectedRoute>} />
        <Route path="bnpl" element={<ProtectedRoute allowedRoles={['buyer', 'admin']}><BNPLApplication /></ProtectedRoute>} />
        <Route path="order-tracking" element={<ProtectedRoute allowedRoles={['buyer', 'admin']}><OrderTracking /></ProtectedRoute>} />
        <Route path="analytics" element={<ProtectedRoute allowedRoles={['buyer', 'admin']}><Analytics /></ProtectedRoute>} />
        <Route path="dowry-estimation" element={<ProtectedRoute allowedRoles={['buyer', 'admin']}><DowryWizard /></ProtectedRoute>} />

        {/* Seller Protected Routes */}
        <Route path="seller/dashboard" element={<ProtectedRoute allowedRoles={['seller']}><SellerDashboard /></ProtectedRoute>} />
        <Route path="seller/upload" element={<ProtectedRoute allowedRoles={['seller']}><ProductUpload /></ProtectedRoute>} />

        {/* Admin Protected Routes */}
        <Route path="admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="admin/users" element={<ProtectedRoute allowedRoles={['admin']}><UserManagement /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
};

export default AppRoutes;
