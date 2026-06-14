import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="animate-fade-in text-center py-24">
      <p className="text-7xl mb-6">🔍</p>
      <h2 className="text-3xl font-bold text-gray-800 mb-3">Page Not Found</h2>
      <p className="text-gray-500 mb-8 max-w-md mx-auto">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/"
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-500 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
        >
          Browse Products
        </Link>
        <a
          href="http://localhost:5173"
          className="px-6 py-3 border-2 border-purple-200 text-purple-700 font-bold rounded-xl hover:bg-purple-50 transition-all"
        >
          Open App
        </a>
      </div>
    </div>
  );
}
