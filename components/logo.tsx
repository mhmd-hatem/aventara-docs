export function Logo({
  icon = false,
  className = "",
}: {
  icon?: boolean;
  className?: string;
}) {
  const variant = icon ? "icon" : "horizontal";
  return (
    <span className={`brand-logo ${icon ? "brand-icon" : ""} ${className}`}>
      <img
        className="logo-light"
        src={`/branding/svg/aventara-${variant}-light.svg`}
        alt="Aventara Framework"
        width={icon ? 40 : 186}
        height={icon ? 40 : 55}
      />
      <img
        className="logo-dark"
        src={`/branding/svg/aventara-${variant}-dark.svg`}
        alt="Aventara Framework"
        width={icon ? 40 : 186}
        height={icon ? 40 : 55}
      />
    </span>
  );
}
