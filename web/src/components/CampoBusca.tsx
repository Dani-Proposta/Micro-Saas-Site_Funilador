import { CloseButton, TextInput } from "@mantine/core";

type Props = {value: string; onChange: (v: string) => void; placeholder?: string};

export function CampoBusca({value, onChange, placeholder = "Título ou descrição..."}: Props) {
    return <TextInput label="Pesquisar" placeholder={placeholder} value={value}
        onChange={e => onChange(e.currentTarget.value)} size="sm"
        leftSection={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>}
        rightSection={value ? <CloseButton size="sm" aria-label="Limpar pesquisa" onClick={() => onChange("")}/> : undefined}
        rightSectionPointerEvents="all"/>;
}
