const features = [
  {
    number: "01",
    title: "Shared expenses",
    description:
      "Keep track of household costs and make it clear who owes what.",
    icon: "↗",
  },
  {
    number: "02",
    title: "Chore rotation",
    description:
      "Share the everyday jobs fairly, without another group-chat reminder.",
    icon: "✳",
  },
  {
    number: "03",
    title: "One household",
    description:
      "Bring the little details of living together into one calm place.",
    icon: "⌂",
  },
];

function App() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f8f5] text-[#20251f]">
      <div className="mx-auto max-w-7xl px-6 sm:px-10">
        <header className="flex items-center justify-between border-b border-[#20251f]/10 py-6">
          <a
            aria-label="Flatmate Ledger home"
            className="flex items-center gap-3"
            href="/"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-[#d9e8d2] text-lg text-[#29432e]">
              ⌂
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Flatmate Ledger
            </span>
          </a>
          <span className="hidden text-sm text-[#697067] sm:block">
            A little more in sync.
          </span>
        </header>

        <section className="grid gap-12 py-20 sm:py-28 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-20">
          <div>
            <p className="mb-6 text-xs font-semibold tracking-[0.2em] text-[#58745a] uppercase">
              Made for living together
            </p>
            <h1 className="max-w-3xl text-5xl leading-[1.08] font-medium tracking-[-0.055em] sm:text-7xl">
              Shared living,
              <br />
              <span className="font-serif font-normal italic text-[#71866c]">
                a little simpler.
              </span>
            </h1>
          </div>
          <div className="max-w-md pb-1 lg:justify-self-end">
            <p className="text-lg leading-8 text-[#697067]">
              Home is better when the bills are clear and everyone knows what
              needs doing. Keep your household on the same page, without the
              spreadsheet shuffle.
            </p>
          </div>
        </section>

        <section
          aria-label="Household tools"
          className="grid border-t border-[#20251f]/10 pb-20 sm:grid-cols-3"
        >
          {features.map((feature) => (
            <article
              className="border-b border-[#20251f]/10 py-8 sm:border-r sm:px-7 sm:py-10 first:sm:pl-0 last:sm:border-r-0 last:sm:pr-0"
              key={feature.number}
            >
              <div className="mb-12 flex items-center justify-between">
                <span className="text-xs tracking-widest text-[#81877d]">
                  {feature.number}
                </span>
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full border border-[#20251f]/10 text-lg text-[#58745a]"
                >
                  {feature.icon}
                </span>
              </div>
              <h2 className="mb-3 text-xl font-medium tracking-tight">
                {feature.title}
              </h2>
              <p className="max-w-xs text-sm leading-6 text-[#697067]">
                {feature.description}
              </p>
            </article>
          ))}
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#20251f]/10 py-6 text-xs text-[#81877d] sm:flex-row sm:justify-between">
          <span>Less friction, more feeling at home.</span>
          <span>Built for your household.</span>
        </footer>
      </div>
    </main>
  );
}

export default App;
