interface Props {
  totalCount: number;
}

export function Header({ totalCount }: Props) {
  return (
    <header className="flex flex-col items-center gap-1 px-4 pt-4 text-center">
      <h1
        className="text-[20px] font-bold leading-none tracking-[-0.01em] text-text"
        style={{ fontFamily: "'Source Sans Pro', system-ui, sans-serif" }}
      >
        Tab Tamer
      </h1>
      <p className="text-[13px] text-text-muted">
        {totalCount > 0 ? `${totalCount} tabs open` : "All quiet"}
      </p>
    </header>
  );
}
