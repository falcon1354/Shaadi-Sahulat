import './globals.css';

export const metadata = {
  title: {
    default: 'ShaadiSahulat — Wedding Marketplace',
    template: '%s — ShaadiSahulat',
  },
  description:
    'Browse verified wedding products on ShaadiSahulat — Pakistan\'s smart wedding planning marketplace.',
  keywords: ['wedding', 'shaadi', 'pakistan', 'bridal', 'marketplace', 'lehenga', 'jewelry', 'furniture'],
  authors: [{ name: 'ShaadiSahulat' }],
  openGraph: {
    siteName: 'ShaadiSahulat',
    type: 'website',
    locale: 'en_PK',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💍</text></svg>" />
      </head>
      <body className="min-h-screen">
        {/* Site-wide header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-purple-100 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <a href="http://localhost:5173" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 bg-gradient-to-br from-purple-600 to-pink-500 rounded-xl flex items-center justify-center text-white text-lg shadow-md group-hover:shadow-lg transition-shadow">
                💍
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm leading-none">ShaadiSahulat</p>
                <p className="text-[10px] text-purple-500 font-medium">Wedding Marketplace</p>
              </div>
            </a>

            <nav className="flex items-center gap-3">
              <a
                href="http://localhost:5173"
                className="text-sm text-gray-600 hover:text-purple-600 font-medium transition-colors hidden sm:block"
              >
                Browse All
              </a>
              <a
                href="http://localhost:5173"
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold rounded-xl hover:from-purple-700 hover:to-pink-600 transition-all shadow-sm hover:shadow-md"
              >
                Open App →
              </a>
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="mt-16 border-t border-gray-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💍</span>
              <div>
                <p className="font-bold text-gray-800 text-sm">ShaadiSahulat</p>
                <p className="text-xs text-gray-400">FYP 2026 · NUCES Chiniot-Faisalabad</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Pakistan's smart wedding planning marketplace.
              Browse verified sellers, manage your dowry budget, and find your perfect wedding look.
            </p>
            <a
              href="http://localhost:5173"
              className="text-sm text-purple-600 font-semibold hover:underline shrink-0"
            >
              Go to full app →
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
