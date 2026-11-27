import { useState } from "react";
import { DateInput, MonthPickerInput } from "@mantine/dates";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/pt-br";
import { useAparencia, useMovimentoReduzido } from "../lib/contextoAparencia";

dayjs.extend(customParseFormat);

type Props = {
    label: string;
    value: string;
    onChange: (valor: string) => void;
    description?: string;
    disabled?: boolean;
    required?: boolean;
    minDate?: string;
    maxDate?: string;
};

// Datas civis: sem conversão para UTC e sem alterações ao contrato da API.
function interpretarData(entrada: string) {
    const data = dayjs(entrada.trim(), "DD/MM/YYYY", true);
    return data.isValid() ? data.format("YYYY-MM-DD") : null;
}

function hoje() { return new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit"}).format(new Date()); }

export function CampoData({label, value, onChange, description, disabled, required = false, minDate, maxDate}: Props) {
    const {aparencia} = useAparencia();
    const reduzir = useMovimentoReduzido();
    const [diaBase, setDiaBase] = useState(hoje);
    const atualizarHoje = () => setDiaBase(hoje());
    const permitida = (data: string) => (!minDate || data >= minDate) && (!maxDate || data <= maxDate);
    const presets = [{label:"Hoje", dias:0}, {label:"Amanhã", dias:1}, {label:"+7 dias", dias:7}, {label:"+30 dias", dias:30}]
        .map(({label, dias}) => ({label, value: dayjs(diaBase).add(dias, "day").format("YYYY-MM-DD")}))
        .filter(({value}) => permitida(value));

    // Base funcional comum; as apresentações Moderna e Expressiva serão refinadas em seus ciclos.
    return <DateInput
        label={label}
        description={description}
        value={value || null}
        onChange={data => {if (data === null || permitida(data)) onChange(data ?? "");}}
        minDate={minDate}
        maxDate={maxDate}
        disabled={disabled}
        required={required}
        clearable={!required}
        allowDeselect={!required}
        clearButtonProps={{"aria-label": "Limpar data"}}
        locale="pt-br"
        firstDayOfWeek={0}
        valueFormat="DD/MM/YYYY"
        dateParser={interpretarData}
        placeholder="dd/mm/aaaa"
        onFocus={atualizarHoje}
        onClick={atualizarHoje}
        presets={presets}
        maxLevel="decade"
        ariaLabels={{nextMonth:"Próximo mês", previousMonth:"Mês anterior", nextYear:"Próximo ano", previousYear:"Ano anterior", nextDecade:"Próxima década", previousDecade:"Década anterior", monthLevelControl:"Escolher mês", yearLevelControl:"Escolher ano"}}
        rightSection={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>}
        classNames={{root:"funilador-campo-data", presetsRoot:"funilador-calendario-corpo", presetsList:"funilador-calendario-atalhos", presetButton:"funilador-calendario-atalho"}}
        popoverProps={{
            position:"bottom-start",
            classNames:{dropdown:`funilador-calendario funilador-calendario--${aparencia.estilo}`},
            radius: aparencia.estilo === "minimalista" ? 6 : undefined,
            shadow: aparencia.estilo === "minimalista" ? "xs" : "md",
            transitionProps:{transition:"fade", duration:reduzir ? 0 : 120},
            middlewares:{flip:true, shift:true},
        }}
    />;
}

// Seletor mensal: o Mantine trabalha com datas completas, a API recebe YYYY-MM.
export function CampoMes({label, value, onChange, maxDate, disabled}: {label: string; value: string; onChange: (valor: string) => void; maxDate?: string; disabled?: boolean}) {
    const {aparencia} = useAparencia();
    const reduzir = useMovimentoReduzido();
    const mesValido = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
    return <MonthPickerInput
        label={label}
        value={mesValido ? `${value}-01` : null}
        onChange={data => {if (data && (!maxDate || data.slice(0,7) <= maxDate.slice(0,7))) onChange(data.slice(0,7));}}
        maxDate={maxDate}
        disabled={disabled}
        allowDeselect={false}
        clearable={false}
        locale="pt-br"
        valueFormat="MMMM [de] YYYY"
        placeholder="Selecione o mês"
        ariaLabels={{nextYear:"Próximo ano", previousYear:"Ano anterior", nextDecade:"Próxima década", previousDecade:"Década anterior", yearLevelControl:"Escolher ano"}}
        classNames={{root:"funilador-campo-data"}}
        popoverProps={{
            position:"bottom-start",
            classNames:{dropdown:`funilador-calendario funilador-calendario--${aparencia.estilo}`},
            radius: aparencia.estilo === "minimalista" ? 6 : undefined,
            shadow: aparencia.estilo === "minimalista" ? "xs" : "md",
            transitionProps:{transition:"fade", duration:reduzir ? 0 : 120},
            middlewares:{flip:true, shift:true},
        }}
    />;
}
