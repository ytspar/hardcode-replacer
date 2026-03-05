export function Button({ children }) {
  return (
    <button
      className="rounded-lg bg-red-500 px-4 py-2 text-white hover:bg-red-600"
      style={{
        borderColor: "#ff0000",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      }}
      type="button"
    >
      {children}
    </button>
  );
}

export function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 style={{ color: "coral" }}>{title}</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function Badge() {
  return (
    <span
      className="rounded-full bg-blue-100 px-2 py-1 text-blue-800 text-sm"
      style={{ backgroundColor: "#dbeafe" }}
    >
      New
    </span>
  );
}

const _styles = {
  header: {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "hsl(220, 90%, 56%)",
  },
  footer: {
    backgroundColor: "#1a1a2e",
    color: "rgb(200, 200, 210)",
    borderTop: "1px solid oklch(0.5 0.2 240)",
  },
};
