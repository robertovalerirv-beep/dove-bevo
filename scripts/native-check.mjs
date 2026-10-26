import { checkNativeOutput } from "../native/build-policy.ts";
console.log(`Native preview output: ${checkNativeOutput("dist/native")} reviewed files`);
