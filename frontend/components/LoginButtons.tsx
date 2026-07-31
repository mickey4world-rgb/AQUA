import { loginUrl } from "@/lib/auth";

type LoginButtonsProps = {
  redirectTo?: string;
  className?: string;
};

export default function LoginButtons({
  redirectTo = "/",
  className = "",
}: LoginButtonsProps) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row ${className}`}>
      <a
        href={loginUrl("aad", redirectTo)}
        className="inline-flex items-center justify-center rounded-md bg-[#0078d4] px-4 py-2 text-sm font-medium text-white hover:bg-[#006cbd]"
      >
        Microsoft でログイン
      </a>
      <a
        href={loginUrl("github", redirectTo)}
        className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        GitHub でログイン
      </a>
    </div>
  );
}
