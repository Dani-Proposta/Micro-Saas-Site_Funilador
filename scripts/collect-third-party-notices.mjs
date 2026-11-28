import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const matchNotice =
  /^(?:licen[cs]e(?:s)?|copying|notice|copyright|third[-_ ]party[-_ ](?:notices|licenses))(?:[._ -].*)?$/i;
const warnings = [];
const optionalAbsent = [];
const sections = { api: [], web: [] };
const webProduction = [];
const manualNotices = {
  'pg-types': 'pg-types.txt',
  'pgpass': 'pgpass.txt',
  'react-remove-scroll-bar': 'react-remove-scroll-bar.txt',
  'http_ece': 'http_ece.txt',
};
for (const env of ["api", "web"]) {
  const base = path.join(root, env);
  const lock = JSON.parse(
    fs.readFileSync(path.join(base, "package-lock.json"), "utf8"),
  );
  if (!lock.packages || !fs.existsSync(path.join(base, "node_modules"))) {
    throw new Error(
      `Dependências não instaladas ou lockfile incompatível: ${env}`,
    );
  }
  for (const [key, info] of Object.entries(lock.packages).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!key || !key.startsWith("node_modules/")) continue;
    const dir = path.resolve(base, key);
    if (!dir.startsWith(path.resolve(base, "node_modules") + path.sep))
      throw new Error(`Caminho inesperado: ${key}`);
    if (!fs.existsSync(path.join(dir, "package.json"))) {
      (info.optional || info.devOptional ? optionalAbsent : warnings).push(
        `${env}/${key}: pacote não instalado`,
      );
      continue;
    }
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    );
    const label = `${env}/${key} — ${pkg.name}@${pkg.version} — ${JSON.stringify(pkg.license ?? info.license ?? "VERIFICAR")}`;
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!matchNotice.test(entry.name)) continue;
      if (entry.isFile()) files.push(path.join(dir, entry.name));
      else if (entry.isDirectory()) {
        for (const f of fs.readdirSync(path.join(dir, entry.name), {
          withFileTypes: true,
        })) {
          if (f.isFile()) files.push(path.join(dir, entry.name, f.name));
          else if (f.isDirectory())
            warnings.push(
              `${label}: revisar subdiretório ${entry.name}/${f.name}`,
            );
        }
      }
    }
    const manualFile = manualNotices[pkg.name];
    const manualPath = manualFile
      ? path.join(root, "licenses", manualFile)
      : null;

    const manualNotice =
      manualPath && fs.existsSync(manualPath)
        ? fs.readFileSync(manualPath, "utf8")
        : null;

    if (!files.length && !manualNotice) {
      warnings.push(
        `${label}: nenhum arquivo de licença/aviso identificado; verificar upstream`,
      );
    }

    if (manualFile && !manualNotice) {
      warnings.push(`${label}: complemento manual não encontrado`);
    }

    if (info.version && pkg.version !== info.version) {
      warnings.push(
        `${label}: versão instalada diverge do lockfile (${info.version})`,
      );
    }

    const body = [
      label,
      ...files
        .sort()
        .map(
          (f) =>
            `--- ${path.relative(dir, f)} ---\n${fs.readFileSync(f, "utf8")}`,
        ),
      ...(manualNotice
        ? [
            `--- Complemento manual: ${manualFile} ---`,
            "Verificar correspondência com a versão instalada.",
            manualNotice,
          ]
        : []),
    ].join("\n\n");
    sections[env].push(body);
    if (env === "web" && !info.dev) webProduction.push(body);
  }
}
const separator = "\n\n" + "=".repeat(72) + "\n\n";
const reactBits = fs.readFileSync(
  path.join(root, "licenses/react-bits.md"),
  "utf8",
);
const header =
  "FUNILADOR — AVISOS DE TERCEIROS\nTextos preservados dos pacotes instalados. Consulte THIRD_PARTY_NOTICES.md.\n";
const report = [
  header,
  ...sections.api,
  ...sections.web,
  "PENDÊNCIAS\n" + (warnings.join("\n") || "Nenhuma detectada pelo coletor."),
  "OPCIONAIS NÃO INSTALADOS (verificar na plataforma de publicação)\n" +
    (optionalAbsent.join("\n") || "Nenhum."),
].join(separator);
fs.writeFileSync(
  path.join(root, "licenses/npm-notices.txt"),
  report + "\n",
  "utf8",
);
fs.writeFileSync(
  path.join(root, "web/public/third-party-notices.txt"),
  [
    header,
    "React Bits — LineSidebar e PillNav\n" + reactBits,
    ...webProduction,
  ].join(separator) + "\n",
  "utf8",
);
console.log(
  `API: ${sections.api.length}; WEB: ${sections.web.length}; WEB produção: ${webProduction.length}`,
);
console.log(
  `Pendências: ${warnings.length}; opcionais não instalados: ${optionalAbsent.length}`,
);
for (const w of warnings) console.warn(w);
if (warnings.length) process.exitCode = 1;
