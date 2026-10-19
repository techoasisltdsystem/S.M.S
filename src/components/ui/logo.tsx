interface LogoProps {
  className?: string;
}

const Logo = ({ className = "w-8 h-8" }: LogoProps) => {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="40" height="40" rx="8" fill="hsl(var(--primary))" />
      <path
        d="M12 12H28V16H24V28H20V16H16V28H12V12Z"
        fill="hsl(var(--primary-foreground))"
      />
      <circle cx="30" cy="10" r="3" fill="hsl(var(--accent))" />
    </svg>
  );
};

export default Logo;
