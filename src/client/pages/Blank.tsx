/** The empty two-column shell, shown while a route decides where to go. */
export function Blank() {
  return (
    <main className="main">
      <section className="h-full w-full p-6 md:p-8 md:flex md:flex-row md:rounded-xl md:shadow-big">
        <div className="md:mr-6 md:w-1/2 w-full" />
        <div className="md:w-1/2 mt-6 md:mt-0 w-full" />
      </section>
    </main>
  );
}
