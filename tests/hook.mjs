import { register } from "node:module";
import "./clock.mjs";
register("./loader.mjs", import.meta.url);
