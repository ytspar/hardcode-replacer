// Fixture for testing JSX structural pattern detection.
// Contains repeated JSX subtrees that the `jsx` command should detect.

// --- Pattern 1: Repeated button+span (exact duplicate, 3x) ---

export function TabButton1() {
  return (
    <button className="h-[60px] px-4 py-2 bg-grey-800 border border-grey-700 flex items-center justify-center">
      <span className="text-sm font-retron tracking-[0.28px] uppercase text-white">Documents</span>
    </button>
  );
}

export function TabButton2() {
  return (
    <button className="h-[60px] px-4 py-2 bg-grey-800 border border-grey-700 flex items-center justify-center">
      <span className="text-sm font-retron tracking-[0.28px] uppercase text-white">Policies</span>
    </button>
  );
}

export function TabButton3() {
  return (
    <button className="h-[60px] px-4 py-2 bg-grey-800 border border-grey-700 flex items-center justify-center">
      <span className="text-sm font-retron tracking-[0.28px] uppercase text-white">Security</span>
    </button>
  );
}

// --- Pattern 2: Repeated section layout (structural duplicate, different classes) ---

export function SectionA() {
  return (
    <section className="py-12 md:py-20">
      <div className="px-4 mx-auto max-w-container">
        <h2 className="text-2xl font-bold">Section A</h2>
      </div>
    </section>
  );
}

export function SectionB() {
  return (
    <section className="py-8 md:py-16">
      <div className="px-6 mx-auto max-w-7xl">
        <h2 className="text-3xl font-semibold">Section B</h2>
      </div>
    </section>
  );
}

// --- Pattern 3: Repeated card with badge (exact duplicate, 2x) ---

export function CardA() {
  return (
    <div className="border border-grey-700 px-6 py-10 flex flex-col gap-6">
      <div className="self-start inline-flex items-center justify-center h-[60px] px-4 py-2 bg-grey-800 border border-grey-700">
        <span className="text-white text-sm font-retron tracking-[0.28px] uppercase">Badge A</span>
      </div>
      <p className="text-white text-base leading-6">Description text for card A.</p>
    </div>
  );
}

export function CardB() {
  return (
    <div className="border border-grey-700 px-6 py-10 flex flex-col gap-6">
      <div className="self-start inline-flex items-center justify-center h-[60px] px-4 py-2 bg-grey-800 border border-grey-700">
        <span className="text-white text-sm font-retron tracking-[0.28px] uppercase">Badge B</span>
      </div>
      <p className="text-white text-base leading-6">Description text for card B.</p>
    </div>
  );
}

// --- Pattern 4: Input field wrapper (exact duplicate, 2x) ---

export function InputA() {
  return (
    <div className="w-full p-4 space-y-2 border border-page-800">
      <div className="text-sm font-normal text-white/80">Email</div>
      <div className="w-full px-4 py-3 border border-none bg-black/10 shadow-input-shadow">
        <input type="text" className="w-full text-base text-white bg-transparent border-0 outline-none" readOnly />
      </div>
    </div>
  );
}

export function InputB() {
  return (
    <div className="w-full p-4 space-y-2 border border-page-800">
      <div className="text-sm font-normal text-white/80">Phone</div>
      <div className="w-full px-4 py-3 border border-none bg-black/10 shadow-input-shadow">
        <input type="text" className="w-full text-base text-white bg-transparent border-0 outline-none" readOnly />
      </div>
    </div>
  );
}

// --- Leaf-only components (should NOT be reported as subtrees) ---

export function Leaf() {
  return <div className="text-white p-4">Just a leaf element</div>;
}
