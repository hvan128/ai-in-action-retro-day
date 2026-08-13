import { avatarUrl } from "@/lib/avatar";

export function UserAvatar({
  seed,
  name,
  className = "",
  title,
}: {
  seed: string;
  name?: string | null;
  className?: string;
  title?: string;
}) {
  return (
    <img
      src={avatarUrl(seed)}
      alt={name ? `Avatar của ${name}` : "Avatar"}
      title={title}
      draggable={false}
      className={`shrink-0 select-none rounded-full bg-white object-cover ${className}`}
    />
  );
}
