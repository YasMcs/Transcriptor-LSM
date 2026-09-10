import TeacherDashboard from '@/components/TeacherDashboard';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 bg-white dark:bg-slate-950">
      <div className="w-full max-w-4xl flex items-center justify-center">
        <TeacherDashboard />
      </div>
    </main>
  );
}
