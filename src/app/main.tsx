import { render } from "preact";
import { APP_NAME } from "../shared/config";

function App() {
  return (
    <main>
      <h1>{APP_NAME}</h1>
    </main>
  );
}

const root = document.getElementById("app");
if (root) render(<App />, root);
