export const dynamic = 'force-dynamic'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 flex-col md:flex-row">
        {}
        <div className="hidden md:flex md:w-1/2 bg-[#EBEBEB] items-center justify-center p-8">
          <div className="flex flex-col items-center gap-6 bg-white rounded-xl p-6 shadow-sm max-w-2xl w-full">
            <img
              src="/AIThink-Discover-Art.png"
              alt="AIThink"
              className="w-full h-full"
            />
            <p className="text-gray-600 text-sm text-center">
              Browse overview of capstone projects
            </p>
            <a
              href="/discover"
              className="inline-flex items-center justify-center w-full rounded-md bg-[#EA4335] px-4 py-2 text-sm font-medium text-white hover:bg-[#d63b2e] transition-colors cursor-pointer"
            >
              Discover
            </a>
          </div>
        </div>

        {}
        <div className="flex flex-1 flex-col items-center p-4 sm:p-6 md:p-8 md:w-1/2 overflow-y-auto">
          <div className="my-auto w-full max-w-sm">
            {children}

            {}
            <div className="mt-6 md:hidden">
              <div className="flex items-center gap-2 bg-[#EBEBEB] rounded-lg px-4 py-3">
                <img
                  src="/AIThink-Discover-Art.png"
                  alt="AIThink"
                  className="w-8 h-8 object-contain shrink-0"
                />
                <p className="text-[10px] text-gray-500 flex-1 leading-tight">
                  Browse overview of capstone projects
                </p>
                <a
                  href="/discover"
                  className="shrink-0 rounded-md bg-[#EA4335] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[#d63b2e] transition-colors"
                >
                  Discover
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {}
      <footer className="bg-[#660111] text-white text-center text-xs py-3">
        <p>&copy; {new Date().getFullYear()} AIThink. All rights reserved.</p>
      </footer>
    </div>
  )
}