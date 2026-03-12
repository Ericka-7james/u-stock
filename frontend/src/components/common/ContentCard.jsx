import "../../css/common/ContentCard.css";

export default function ContentCard({
  as = "article",
  title,
  titleAs = "h2",
  titleClassName = "",
  className = "",
  children,
  ...rest
}) {
  const Tag = as;
  const TitleTag = titleAs;

  const classes = ["content-card", className].filter(Boolean).join(" ");
  const titleClasses = ["content-card-title", titleClassName].filter(Boolean).join(" ");

  return (
    <Tag className={classes} {...rest}>
      {title ? <TitleTag className={titleClasses}>{title}</TitleTag> : null}
      {children}
    </Tag>
  );
}