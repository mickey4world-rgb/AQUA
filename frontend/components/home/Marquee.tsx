type MarqueeProps = {
  items: string[];
};

export default function Marquee({ items }: MarqueeProps) {
  return (
    <div className="marquee border-y border-white/10 py-3.5">
      <div className="marquee__track">
        {[0, 1].map((pass) => (
          <div key={pass} className="flex" aria-hidden={pass === 1}>
            {items.map((item) => (
              <span key={`${pass}-${item}`} className="marquee__item">
                {item}
                <span className="text-cyan-400/50">✦</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
