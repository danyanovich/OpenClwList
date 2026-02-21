export default function Page() {
    return (
        <main className="min-h-screen p-8 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px]" />

            <div className="z-10 bg-white/5 border border-white/10 p-12 rounded-3xl shadow-2xl backdrop-blur-xl flex flex-col items-center max-w-2xl text-center">
                <h1 className="text-5xl font-extrabold bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent pb-2">
                    ClawProject Ops Dashboard
                </h1>
                <p className="mt-6 text-gray-400 text-lg">
                    Next.js is now rendering the Express UI seamlessly.
                </p>

                <div className="mt-10 flex justify-center gap-4">
                    <a href="/agents" className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 transition-colors text-white font-medium shadow-lg shadow-blue-500/30">
                        View Agents
                    </a>
                    <a href="/tasks" className="px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-medium shadow-lg shadow-indigo-500/30">
                        Task Manager
                    </a>
                </div>
            </div>
        </main>
    )
}
