import React, { useState } from 'react';

export default function SellerDashboard({ seller }) {
  const [stats] = useState({
    totalProducts: 12,
    totalSales: 285000,
    totalOrders: 24,
    totalCustomers: 18,
  });

  const [topProducts] = useState([
    { id: 1, name: 'Bridal Lehenga - Gold Embroidered', sales: 8, revenue: 224000 },
    { id: 2, name: 'Groom Sherwani - Navy Blue', sales: 5, revenue: 60000 },
    { id: 3, name: 'Bridal Jewelry Set', sales: 3, revenue: 15000 },
  ]);

  const [recentOrders] = useState([
    { id: 1, customer: 'Fatima Ahmed', product: 'Bridal Lehenga', amount: 28000, date: '2024-01-15', status: 'Delivered' },
    { id: 2, customer: 'Ayesha Khan', product: 'Groom Sherwani', amount: 12000, date: '2024-01-10', status: 'Shipped' },
    { id: 3, customer: 'Sophia Ali', product: 'Jewelry Set', amount: 5000, date: '2024-01-08', status: 'Processing' },
    { id: 4, customer: 'Zainab Hassan', product: 'Bridal Lehenga', amount: 28000, date: '2024-01-05', status: 'Delivered' },
  ]);

  const [monthlySales] = useState([
    { month: 'Dec', sales: 45000 },
    { month: 'Jan', sales: 85000 },
    { month: 'Feb', sales: 65000 },
    { month: 'Mar', sales: 90000 },
  ]);

  const maxMonthlySale = Math.max(...monthlySales.map(m => m.sales));

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-red-500 rounded-2xl p-6 text-white shadow-lg">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {seller?.name?.split(' ')[0]}! 🏪</h1>
        <p className="text-pink-100">Manage your store and track your sales</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Products</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.totalProducts}</h3>
            </div>
            <span className="text-2xl">📦</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">In your catalog</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Revenue</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">Rs {(stats.totalSales / 1000).toLocaleString()}K</h3>
            </div>
            <span className="text-2xl">💰</span>
          </div>
          <p className="text-xs text-green-500 mt-2">↑ 12% this month</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Total Orders</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.totalOrders}</h3>
            </div>
            <span className="text-2xl">🛒</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Orders received</p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-pink-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-sm font-medium">Customers</p>
              <h3 className="text-2xl font-bold text-gray-800 mt-1">{stats.totalCustomers}</h3>
            </div>
            <span className="text-2xl">👥</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Unique buyers</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button className="p-4 bg-white rounded-xl border border-pink-100 hover:shadow-md transition-all text-center cursor-pointer group">
          <span className="text-3xl mb-2 block group-hover:scale-110 transition-transform">➕</span>
          <p className="text-sm font-medium text-gray-800">Add Product</p>
          <p className="text-xs text-gray-400">Upload new item</p>
        </button>
        <button className="p-4 bg-white rounded-xl border border-pink-100 hover:shadow-md transition-all text-center cursor-pointer group">
          <span className="text-3xl mb-2 block group-hover:scale-110 transition-transform">📊</span>
          <p className="text-sm font-medium text-gray-800">Analytics</p>
          <p className="text-xs text-gray-400">View insights</p>
        </button>
        <button className="p-4 bg-white rounded-xl border border-pink-100 hover:shadow-md transition-all text-center cursor-pointer group">
          <span className="text-3xl mb-2 block group-hover:scale-110 transition-transform">💬</span>
          <p className="text-sm font-medium text-gray-800">Messages</p>
          <p className="text-xs text-gray-400">2 new inquiries</p>
        </button>
        <button className="p-4 bg-white rounded-xl border border-pink-100 hover:shadow-md transition-all text-center cursor-pointer group">
          <span className="text-3xl mb-2 block group-hover:scale-110 transition-transform">⚙️</span>
          <p className="text-sm font-medium text-gray-800">Settings</p>
          <p className="text-xs text-gray-400">Manage account</p>
        </button>
      </div>

      {/* Monthly Sales Chart */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-pink-100">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <span>📈</span> Monthly Sales Trend
        </h2>
        
        <div className="flex items-end justify-around h-48 gap-4">
          {monthlySales.map((item, idx) => (
            <div key={idx} className="flex flex-col items-center flex-1">
              <div className="text-xs text-gray-500 mb-2">Rs {(item.sales / 1000).toLocaleString()}K</div>
              <div className="w-full bg-gray-200 rounded-t-lg hover:opacity-75 transition-opacity cursor-pointer" style={{
                height: `${(item.sales / maxMonthlySale) * 100}%`,
                background: 'linear-gradient(to top, #ec4899, #f472b6)'
              }} />
              <div className="text-xs font-medium text-gray-600 mt-2">{item.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-pink-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span>📋</span> Recent Orders
          </h2>
          
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{order.customer}</p>
                  <p className="text-xs text-gray-500">{order.product}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-800">Rs {order.amount.toLocaleString()}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full block mt-1 text-center ${
                    order.status === 'Delivered'
                      ? 'bg-green-100 text-green-700'
                      : order.status === 'Shipped'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 px-4 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 transition-colors">
            View All Orders
          </button>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-pink-100">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span>⭐</span> Top Products
          </h2>
          
          <div className="space-y-3">
            {topProducts.map((product, idx) => (
              <div key={product.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-pink-600">#{idx + 1}</span>
                      <p className="text-sm font-medium text-gray-800 line-clamp-1">{product.name}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{product.sales} sales</p>
                  </div>
                  <p className="text-sm font-bold text-pink-600">Rs {product.revenue.toLocaleString()}</p>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-pink-400 to-red-400 h-1.5 rounded-full"
                    style={{ width: `${(product.revenue / topProducts[0].revenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 px-4 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 transition-colors">
            View All Products
          </button>
        </div>
      </div>

      {/* Alerts & Notifications */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-200">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span>🔔</span> Important Alerts
        </h3>
        <div className="space-y-2 text-sm text-gray-700">
          <p>✓ 2 products need stock update</p>
          <p>✓ 1 pending order needs confirmation</p>
          <p>✓ Your store rating: 4.8/5 ⭐</p>
        </div>
      </div>
    </div>
  );
}
