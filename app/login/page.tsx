import { LoginForm } from '@/components/login-form';

// Copre l'intero viewport: l'app resta visibile sotto, sfocata e illeggibile.
export const metadata = { title: 'Accesso' };

export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1f]/55 px-6 backdrop-blur-xl">
      <div className="shadow-2xl shadow-sky-500/10">
        <LoginForm />
      </div>
    </div>
  );
}
