import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { CampoFecha } from "@/components/campo-fecha";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import {
  calcularTotales,
  guardarOrdenCompleta,
  obtenerOrden,
  type ServicioParaGuardar,
} from "@/services/ordenesService";

import {
  limpiarSeleccionTarifario,
  obtenerSeleccionTarifario,
} from "@/services/orderDraftStore";

import { buscarServicios } from "@/services/tarifarioService";
import { listarTecnicos } from "@/services/tecnicosService";

import {
  MODALIDADES_SERVICIO,
  TIPOS_COBERTURA,
  type ModalidadServicio,
  type NuevaOrden,
  type NuevoOrdenMaterial,
  type NuevoOrdenTecnico,
  type NuevoOrdenEquipo,
  type TipoCobertura,
} from "@/types/ordenes.types";

import type { Servicio } from "@/types/tarifario.types";
import type { Tecnico } from "@/types/tecnicos.types";

function formatoMoneda(valor: number, moneda: "CUP" | "USD") {
  return new Intl.NumberFormat("es-CU", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: 2,
  }).format(valor || 0);
}

function numeroLocal(valor: string, respaldo = 0): number {
  const limpio = valor.trim().replace(/\s/g, "");
  if (!limpio) return respaldo;
  const normalizado =
    limpio.includes(",") && limpio.includes(".")
      ? limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "")
      : limpio.includes(",")
        ? limpio.replace(",", ".")
        : limpio;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : respaldo;
}

function numeroLocalEstricto(valor: string): number {
  const limpio = valor.trim().replace(/\s/g, "");
  if (!limpio) return NaN;
  const normalizado =
    limpio.includes(",") && limpio.includes(".")
      ? limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, "")
      : limpio.includes(",")
        ? limpio.replace(",", ".")
        : limpio;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

function estadoEtiqueta(
  estado: "pendiente" | "en_progreso" | "finalizada" | "facturada",
) {
  return (
    {
      pendiente: "Pendiente",
      en_progreso: "En progreso",
      finalizada: "Finalizada",
      facturada: "Facturada",
    } as const
  )[estado];
}

type MaterialLocal = {
  clave: string;
  vale: string;
  codigo: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: string;
  nroSerie: string;
  importeCUP: string;
  importeUSD: string;
};

type ServicioLocal = {
  clave: string;
  servicioId: number | null;
  codigo: string;
  descripcion: string;
  cantidad: string;
  importeCUP: string;
  importeUSD: string;
};

type TecnicoLocal = {
  clave: string;
  tecnicoId: number | null;
  nombre: string;
  ci: string;
  cargo: string;
  firmado: boolean;
};

type EquipoLocal = {
  clave: string;
  marca: string;
  modelo: string;
  nroSerie: string;
};

const materialVacio = (): MaterialLocal => ({
  clave: `m-${Date.now()}-${Math.random()}`,
  vale: "",
  codigo: "",
  descripcion: "",
  unidadMedida: "",
  cantidad: "1",
  nroSerie: "",
  importeCUP: "0",
  importeUSD: "0",
});

const equipoVacio = (): EquipoLocal => ({
  clave: `e-${Date.now()}-${Math.random()}`,
  marca: "",
  modelo: "",
  nroSerie: "",
});

const tecnicoVacio = (): TecnicoLocal => ({
  clave: `t-${Date.now()}-${Math.random()}`,
  tecnicoId: null,
  nombre: "",
  ci: "",
  cargo: "",
  firmado: false,
});

function formularioVacio() {
  return {
    folio: null as string | null,

    estadoSeleccionado: "pendiente" as
      | "pendiente"
      | "en_progreso"
      | "finalizada"
      | "facturada",

    codigoReporte: "",
    reportadoPor: "",
    fechaReporte: "",

    codigoOrden: "",
    codigoFactura: "",

    tipoCobertura: null as TipoCobertura | null,

    modalidadMultiple: false,

    clienteCodigo: "",
    clienteTipo: "",
    clienteNombre: "",
    clienteDireccion: "",
    clienteMunicipio: "",
    clienteProvincia: "",

    modalidadesServicio: [] as ModalidadServicio[],

    equipoTipo: "",
    equipoMarca: "",
    equipoModelo: "",
    equipoNroSerie: "",

    fechaInicio: "",
    fechaFin: "",
    tiempoTrabajoMinutos: "",

    observaciones: "",

    equipos: [] as EquipoLocal[],
    materiales: [] as MaterialLocal[],
    servicios: [] as ServicioLocal[],
    tecnicos: [] as TecnicoLocal[],

    revisorNombre: "",
    revisorCargo: "",
    revisorFecha: "",
    revisorFirmado: false,

    clienteFirmaNombre: "",
    clienteFirmaCargo: "",
    clienteFirmaCI: "",
    clienteFirmaFecha: "",
    clienteFirmado: false,
  };
}

// Estado en blanco de todo el formulario — se reutiliza tanto al montar
// "Nueva orden" por primera vez como al resetear cuando se vuelve a esta
// pantalla sin id (ver useFocusEffect más abajo).

type FormularioOrden = ReturnType<typeof formularioVacio>;

function parseModalidades(valor: string | null): ModalidadServicio[] {
  if (!valor) return [];
  try {
    const parsed: unknown = JSON.parse(valor);
    if (!Array.isArray(parsed)) return [];
    const validas = new Set(MODALIDADES_SERVICIO.map((item) => item.valor));
    return parsed.filter(
      (item): item is ModalidadServicio =>
        typeof item === "string" && validas.has(item as ModalidadServicio),
    );
  } catch {
    return [];
  }
}
export default function OrdenNuevaScreen() {
  const theme = useTheme();
  const router = useRouter();

  const params = useLocalSearchParams<{ id?: string }>();
  const idParam = typeof params.id === "string" ? params.id.trim() : "";
  const idNumerico = Number(idParam);
  const idOrden = Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : null;

  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const rutaInicializada = useRef<string | null | undefined>(undefined);

  const [form, setForm] = useState<FormularioOrden>(formularioVacio());

  const campo = <K extends keyof FormularioOrden>(
    clave: K,
    valor: FormularioOrden[K],
  ) => {
    setForm((prev) => ({
      ...prev,
      [clave]: valor,
    }));
  };

  const [buscarTexto, setBuscarTexto] = useState("");
  const [resultadosBusqueda, setResultadosBusqueda] = useState<Servicio[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [tecnicosBD, setTecnicosBD] = useState<Tecnico[]>([]);
  const [selectorTecnico, setSelectorTecnico] = useState(false);
  const [tecnicoEditandoClave, setTecnicoEditandoClave] = useState<
    string | null
  >(null);
  const [selectorEstado, setSelectorEstado] = useState(false);

  // La pantalla puede mantenerse montada al cambiar de pestaña. Inicializamos
  // una ruta nueva solo cuando cambia el id; al volver al foco se conserva el
  // borrador en vez de destruirlo. Una orden existente sí se recarga cuando
  // se entra con otro id.
  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      const claveRuta = idOrden == null ? "nuevo" : `editar:${idOrden}`;

      if (rutaInicializada.current === claveRuta && idOrden == null) {
        const seleccion = obtenerSeleccionTarifario();
        if (seleccion.length) {
          setForm((prev) => ({
            ...prev,
            servicios: [
              ...prev.servicios,
              ...seleccion.map((servicio) => ({
                clave: `s-${servicio.id}-${Date.now()}-${Math.random()}`,
                servicioId: servicio.id,
                codigo: servicio.codigoServicio,
                descripcion: servicio.nombreServicio,
                cantidad: prev.modalidadMultiple ? String(prev.equipos.length) : "1",
                importeCUP: String(servicio.precioBase),
                importeUSD: "0",
              })),
            ],
          }));
          limpiarSeleccionTarifario();
        }
        listarTecnicos().then(setTecnicosBD).catch(() => setTecnicosBD([]));
        return () => {
          cancelado = true;
        };
      }
      rutaInicializada.current = claveRuta;
      setErrorCarga(null);

      if (idOrden == null) {
        setForm(formularioVacio());
        setBuscarTexto("");
        setResultadosBusqueda([]);
        const seleccion = obtenerSeleccionTarifario();
        if (seleccion.length) {
          setForm((prev) => ({
            ...prev,
            servicios: seleccion.map((s) => ({
              clave: `s-${s.id}-${Date.now()}-${Math.random()}`,
              servicioId: s.id,
              codigo: s.codigoServicio,
              descripcion: s.nombreServicio,
              cantidad: "1",
              importeCUP: String(s.precioBase),
              importeUSD: "0",
            })),
          }));
          limpiarSeleccionTarifario();
        }
        listarTecnicos()
          .then(setTecnicosBD)
          .catch(() => setTecnicosBD([]));
        setCargando(false);
        return () => {
          cancelado = true;
        };
      }

      setCargando(true);
      listarTecnicos()
        .then(setTecnicosBD)
        .catch(() => setTecnicosBD([]));
      obtenerOrden(idOrden)
        .then((orden) => {
          if (cancelado) return;
          if (!orden) {
            setErrorCarga("La orden solicitada no existe o fue eliminada. No se puede abrir ni guardar una ficha vacía.");
            return;
          }
          setForm({
            folio: orden.numeroOrden,
            estadoSeleccionado: orden.estado,
            codigoReporte: orden.codigoReporte ?? "",
            reportadoPor: orden.reportadoPor ?? "",
            fechaReporte: orden.fechaReporte ?? "",
            codigoOrden: orden.codigoOrden ?? "",
            codigoFactura: orden.codigoFactura ?? "",
            tipoCobertura: orden.tipoCobertura,
            modalidadMultiple: Boolean(orden.modalidadMultiple),
            clienteCodigo: orden.clienteCodigo ?? "",
            clienteTipo: orden.clienteTipo ?? "",
            clienteNombre: orden.clienteNombre ?? "",
            clienteDireccion: orden.clienteDireccion ?? "",
            clienteMunicipio: orden.clienteMunicipio ?? "",
            clienteProvincia: orden.clienteProvincia ?? "",
            modalidadesServicio: parseModalidades(orden.modalidadesServicio),
            equipos:
              orden.equipos.length > 0
                ? orden.equipos.map((e) => ({
                    clave: `e-${e.id}`,
                    marca: e.marca ?? "",
                    modelo: e.modelo ?? "",
                    nroSerie: e.nroSerie ?? "",
                  }))
                : orden.modalidadMultiple
                  ? [
                      {
                        clave: "e-legacy-1",
                        marca: orden.equipoMarca ?? "",
                        modelo: orden.equipoModelo ?? "",
                        nroSerie: orden.equipoNroSerie ?? "",
                      },
                      equipoVacio(),
                    ]
                  : [],
            equipoTipo: orden.equipoTipo ?? "",
            equipoMarca: orden.equipoMarca ?? "",
            equipoModelo: orden.equipoModelo ?? "",
            equipoNroSerie: orden.equipoNroSerie ?? "",
            fechaInicio: orden.fechaInicio ?? "",
            fechaFin: orden.fechaFin ?? "",
            tiempoTrabajoMinutos: orden.tiempoTrabajoMinutos
              ? String(orden.tiempoTrabajoMinutos)
              : "",
            observaciones: orden.observaciones ?? "",
            materiales: orden.materiales.map((m) => ({
              clave: `m-${m.id}`,
              vale: m.vale ?? "",
              codigo: m.codigo ?? "",
              descripcion: m.descripcion ?? "",
              unidadMedida: m.unidadMedida ?? "",
              cantidad: String(m.cantidad),
              nroSerie: m.nroSerie ?? "",
              importeCUP: String(m.importeCUP),
              importeUSD: String(m.importeUSD),
            })),
            servicios: orden.servicios.map((s) => ({
              clave: `s-${s.id}`,
              servicioId: s.servicioId ?? null,
              codigo: s.codigo ?? "",
              descripcion: s.descripcion ?? "",
              cantidad: String(s.cantidad),
              importeCUP: String(s.importeCUP),
              importeUSD: String(s.importeUSD),
            })),
            tecnicos: orden.tecnicos.map((t) => ({
              clave: `t-${t.id}`,
              tecnicoId: t.tecnicoId ?? null,
              nombre: t.nombre ?? "",
              ci: t.ci ?? "",
              cargo: t.cargo ?? "",
              firmado: Boolean(t.firmado),
            })),
            revisorNombre: orden.revisorNombre ?? "",
            revisorCargo: orden.revisorCargo ?? "",
            revisorFecha: orden.revisorFecha ?? "",
            revisorFirmado: Boolean(orden.revisorFirmado),
            clienteFirmaNombre: orden.clienteFirmaNombre ?? "",
            clienteFirmaCargo: orden.clienteFirmaCargo ?? "",
            clienteFirmaCI: orden.clienteFirmaCI ?? "",
            clienteFirmaFecha: orden.clienteFirmaFecha ?? "",
            clienteFirmado: Boolean(orden.clienteFirmado),
          });
        })
        .catch((error) => {
          if (!cancelado) {
            setErrorCarga(
              error instanceof Error
                ? `No se pudo cargar la orden: ${error.message}`
                : "No se pudo cargar la orden.",
            );
          }
        })
        .finally(() => {
          if (!cancelado) setCargando(false);
        });

      return () => {
        cancelado = true;
        setCargando(false);
      };
    }, [idOrden]),
  );

  useFocusEffect(
    useCallback(() => {
      // Limpia la búsqueda embebida del tarifario cada vez que se sale y
      // se vuelve a esta pantalla, para no dejar resultados de una orden
      // anterior colgando.

      return () => {
        setBuscarTexto("");
        setResultadosBusqueda([]);
      };
    }, []),
  );

  useEffect(() => {
    const texto = buscarTexto.trim();
    if (!texto) {
      // Se saca del cuerpo síncrono del efecto con un timeout de 0 en vez
      // de llamar setResultadosBusqueda([]) directo — la regla de hooks
      // marca error si un efecto hace setState antes de cualquier salto
      // asíncrono.

      const t = setTimeout(() => setResultadosBusqueda([]), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setBuscando(true);
      buscarServicios(texto, { limite: 8 })
        .then(setResultadosBusqueda)
        .finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [buscarTexto]);

  const totales = useMemo(() => {
    const m = form.materiales.map((x) => ({
      importeCUP: numeroLocal(x.importeCUP, 0),
      importeUSD: numeroLocal(x.importeUSD, 0),
      cantidad: numeroLocal(x.cantidad, 0),
      id: 0,
      ordenId: 0,
      vale: null,
      codigo: null,
      descripcion: null,
      unidadMedida: null,
      nroSerie: null,
    }));
    const s = form.servicios.map((x) => ({
      importeCUP: numeroLocal(x.importeCUP, 0),
      importeUSD: numeroLocal(x.importeUSD, 0),
      cantidad: numeroLocal(x.cantidad, 1),
      id: 0,
      ordenId: 0,
      servicioId: null,
      codigo: null,
      descripcion: null,
    }));
    return calcularTotales(m, s);
  }, [form.materiales, form.servicios]);

  const sincronizarCantidadesServicios = useCallback(
    (
      equipos: EquipoLocal[],
      servicios: ServicioLocal[],
      modalidadMultiple: boolean,
    ) =>
      modalidadMultiple
        ? servicios.map((servicio) => ({
            ...servicio,
            cantidad: String(equipos.length),
          }))
        : servicios,
    [],
  );

  const alternarModalidad = useCallback((valor: ModalidadServicio) => {
    setForm((prev) => ({
      ...prev,
      modalidadesServicio: prev.modalidadesServicio.includes(valor)
        ? prev.modalidadesServicio.filter((v) => v !== valor)
        : [...prev.modalidadesServicio, valor],
    }));
  }, []);

  function agregarServicioDesdeResultado(servicio: Servicio) {
    setForm((prev) => {
      const nuevo = {
        clave: `s-nuevo-${Date.now()}-${Math.random()}`,
        servicioId: servicio.id,
        codigo: servicio.codigoServicio,
        descripcion: servicio.nombreServicio,
        cantidad: prev.modalidadMultiple ? String(prev.equipos.length) : "1",
        importeCUP: String(servicio.precioBase),
        importeUSD: "0",
      };
      return {
        ...prev,
        servicios: [...prev.servicios, nuevo],
      };
    });
    setBuscarTexto("");
    setResultadosBusqueda([]);
  }

  function agregarEquipo() {
    setForm((prev) => {
      const equipos = [...prev.equipos, equipoVacio()];
      return {
        ...prev,
        equipos,
        servicios: sincronizarCantidadesServicios(equipos, prev.servicios, prev.modalidadMultiple),
      };
    });
  }

  function eliminarEquipo(clave: string) {
    setForm((prev) => {
      if (prev.equipos.length <= 2) {
        Alert.alert("Equipos", "Una orden en modalidad múltiple debe conservar al menos dos equipos.");
        return prev;
      }
      const equipos = prev.equipos.filter((equipo) => equipo.clave !== clave);
      return {
        ...prev,
        equipos,
        servicios: sincronizarCantidadesServicios(equipos, prev.servicios, prev.modalidadMultiple),
      };
    });
  }

  function actualizarEquipo(
    clave: string,
    campoNombre: "marca" | "modelo" | "nroSerie",
    valor: string,
  ) {
    setForm((prev) => ({
      ...prev,
      equipos: prev.equipos.map((equipo) =>
        equipo.clave === clave ? { ...equipo, [campoNombre]: valor } : equipo,
      ),
    }));
  }

  function actualizarMaterial(
    clave: string,
    campoNombre: keyof MaterialLocal,
    valor: string,
  ) {
    setForm((prev) => ({
      ...prev,
      materiales: prev.materiales.map((m) =>
        m.clave === clave ? { ...m, [campoNombre]: valor } : m,
      ),
    }));
  }

  function actualizarServicio(
    clave: string,
    campoNombre: "cantidad" | "importeCUP" | "importeUSD",
    valor: string,
  ) {
    setForm((prev) => ({
      ...prev,
      servicios: prev.servicios.map((s) =>
        s.clave === clave ? { ...s, [campoNombre]: valor } : s,
      ),
    }));
  }

  function actualizarTecnico(
    clave: string,
    campoNombre: "nombre" | "ci" | "cargo",
    valor: string,
  ) {
    setForm((prev) => ({
      ...prev,
      tecnicos: prev.tecnicos.map((t) =>
        t.clave === clave ? { ...t, [campoNombre]: valor } : t,
      ),
    }));
  }

  function alternarFirmaTecnico(clave: string) {
    setForm((prev) => ({
      ...prev,
      tecnicos: prev.tecnicos.map((t) =>
        t.clave === clave ? { ...t, firmado: !t.firmado } : t,
      ),
    }));
  }

  async function guardar() {
    if (guardando) return;

    if (form.modalidadMultiple && form.equipos.length < 2) {
      Alert.alert("Modalidad múltiple", "Agregue al menos dos equipos atendidos.");
      return;
    }

    const cantidadesMaterialesValidas = form.materiales.every((m) => numeroLocal(m.cantidad, 0) > 0);
    const cantidadesServiciosValidas = form.servicios.every((s) => numeroLocal(s.cantidad, 0) > 0);
    if (!cantidadesMaterialesValidas || !cantidadesServiciosValidas) {
      Alert.alert("Cantidades", "Todas las cantidades deben ser mayores que cero.");
      return;
    }
    const preciosValidos =
      form.materiales.every((m) => {
        const cup = numeroLocalEstricto(m.importeCUP);
        const usd = numeroLocalEstricto(m.importeUSD);
        return Number.isFinite(cup) && cup >= 0 && Number.isFinite(usd) && usd >= 0;
      }) &&
      form.servicios.every((s) => {
        const cup = numeroLocalEstricto(s.importeCUP);
        const usd = numeroLocalEstricto(s.importeUSD);
        return Number.isFinite(cup) && cup >= 0 && Number.isFinite(usd) && usd >= 0;
      });
    if (!preciosValidos) {
      Alert.alert("Importes", "Los importes deben ser números válidos y no pueden ser negativos.");
      return;
    }

    setGuardando(true);

    try {
      const datos: NuevaOrden = {
        estado: form.estadoSeleccionado,

        tecnicoId:
          form.tecnicos.find((t) => t.tecnicoId != null)?.tecnicoId ?? null,

        codigoReporte: form.codigoReporte || null,
        reportadoPor: form.reportadoPor || null,
        fechaReporte: form.fechaReporte || null,

        codigoOrden: form.codigoOrden || null,
        codigoFactura: form.codigoFactura || null,

        tipoCobertura: form.tipoCobertura ?? null,

        modalidadMultiple: form.modalidadMultiple ? 1 : 0,

        clienteCodigo: form.clienteCodigo || null,
        clienteTipo: form.clienteTipo || null,
        clienteNombre: form.clienteNombre || null,
        clienteDireccion: form.clienteDireccion || null,
        clienteMunicipio: form.clienteMunicipio || null,
        clienteProvincia: form.clienteProvincia || null,

        modalidadesServicio: JSON.stringify(form.modalidadesServicio),

        equipoTipo: form.equipoTipo || null,
        equipoMarca: (form.modalidadMultiple ? form.equipos[0]?.marca : form.equipoMarca) || null,
        equipoModelo: (form.modalidadMultiple ? form.equipos[0]?.modelo : form.equipoModelo) || null,
        equipoNroSerie: (form.modalidadMultiple ? form.equipos[0]?.nroSerie : form.equipoNroSerie) || null,

        fechaInicio: form.fechaInicio || null,
        fechaFin: form.fechaFin || null,

        tiempoTrabajoMinutos: form.tiempoTrabajoMinutos
          ? numeroLocal(form.tiempoTrabajoMinutos, 0)
          : null,

        observaciones: form.observaciones || null,

        revisorNombre: form.revisorNombre || null,
        revisorCargo: form.revisorCargo || null,
        revisorFecha: form.revisorFecha || null,
        revisorFirmado: form.revisorFirmado ? 1 : 0,

        clienteFirmaNombre: form.clienteFirmaNombre || null,
        clienteFirmaCargo: form.clienteFirmaCargo || null,
        clienteFirmaCI: form.clienteFirmaCI || null,
        clienteFirmaFecha: form.clienteFirmaFecha || null,
        clienteFirmado: form.clienteFirmado ? 1 : 0,
      };

      const materialesParaGuardar: NuevoOrdenMaterial[] = form.materiales.map(
        (m) => ({
          vale: m.vale || null,
          codigo: m.codigo || null,
          descripcion: m.descripcion || null,
          unidadMedida: m.unidadMedida || null,
          cantidad: numeroLocal(m.cantidad, 0),
          nroSerie: m.nroSerie || null,
          importeCUP: numeroLocal(m.importeCUP, 0),
          importeUSD: numeroLocal(m.importeUSD, 0),
        }),
      );

      const serviciosParaGuardar: ServicioParaGuardar[] = form.servicios.map(
        (s) => ({
          servicioId: s.servicioId ?? null,
          codigo: s.codigo,
          descripcion: s.descripcion,
          cantidad: numeroLocal(s.cantidad, 0),
          importeCUP: numeroLocal(s.importeCUP, 0),
          importeUSD: numeroLocal(s.importeUSD, 0),
        }),
      );

      const tecnicosParaGuardar: NuevoOrdenTecnico[] = form.tecnicos.map(
        (t) => ({
          tecnicoId: t.tecnicoId ?? null,
          nombre: t.nombre || null,
          cargo: t.cargo || null,
          ci: t.ci || null,
          firmado: t.firmado ? 1 : 0,
        }),
      );

      const equiposParaGuardar: NuevoOrdenEquipo[] = form.modalidadMultiple
        ? form.equipos.map((e) => ({
            marca: e.marca.trim() || null,
            modelo: e.modelo.trim() || null,
            nroSerie: e.nroSerie.trim() || null,
          }))
        : [];

      await guardarOrdenCompleta(idOrden ?? null, {
        datos,
        equipos: equiposParaGuardar,
        materiales: materialesParaGuardar,
        servicios: serviciosParaGuardar,
        tecnicos: tecnicosParaGuardar,
      });

      // The tab stays mounted. Invalidate its route key and clear the draft
      // so a later "+ Nueva orden" can never duplicate the previous order.
      rutaInicializada.current = undefined;
      setForm(formularioVacio());
      setErrorCarga(null);
      setBuscarTexto("");
      setResultadosBusqueda([]);
      router.replace("/ordenes");
    } catch (error) {
      console.error("[GBOTtel] No se pudo guardar la orden:", error);

      Alert.alert(
        "No se pudo guardar",
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado. Los cambios no se guardaron.",
      );
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ThemedView style={[styles.flex, styles.centrado]}>
          <ActivityIndicator color={theme.primary} />
        </ThemedView>
      </SafeAreaView>
    );
  }

  if (errorCarga) {
    return (
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <ThemedView style={[styles.flex, styles.centrado, styles.errorCarga]}>
          <ThemedText type="title" style={{ fontSize: 20 }}>No se pudo abrir la orden</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.errorTexto}>
            {errorCarga}
          </ThemedText>
          <Pressable onPress={() => router.replace("/ordenes")}>
            <ThemedView type="primary" style={styles.botonGuardar}>
              <ThemedText style={styles.botonGuardarTexto}>Volver a órdenes</ThemedText>
            </ThemedView>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ThemedView style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.contenido}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              COPEXTEL
            </ThemedText>
            <ThemedText type="title" style={styles.titulo}>
              Orden de Servicio
            </ThemedText>
            <ThemedText themeColor="textSecondary">
              {form.folio
                ? `Folio ${form.folio}`
                : "Folio se asigna al guardar"}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Estado de la Orden de Servicio
            </ThemedText>
            <Pressable
              onPress={() => setSelectorEstado(true)}
              style={[
                styles.selector,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <ThemedText type="smallBold">
                {estadoEtiqueta(form.estadoSeleccionado)}
              </ThemedText>
              <ThemedText themeColor="textSecondary">▼</ThemedText>
            </Pressable>
          </View>

          <Seccion titulo="1. Encabezado y Control del Documento">
            <Campo
              etiqueta="Código del Reporte"
              valor={form.codigoReporte}
              onCambia={(v) => campo("codigoReporte", v)}
            />
            <Campo
              etiqueta="Reportado por"
              valor={form.reportadoPor}
              onCambia={(v) => campo("reportadoPor", v)}
            />
            <CampoFecha
              etiqueta="Fecha del Reporte"
              valorISO={form.fechaReporte}
              modo="date"
              onCambia={(v) => campo("fechaReporte", v)}
            />
            <Campo
              etiqueta="Código de la Orden"
              valor={form.codigoOrden}
              onCambia={(v) => campo("codigoOrden", v)}
            />
            <Campo
              etiqueta="Código de la Factura"
              valor={form.codigoFactura}
              onCambia={(v) => campo("codigoFactura", v)}
            />
          </Seccion>
          <Seccion titulo="2. Clasificación del Servicio">
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.subEtiqueta}
            >
              Tipo de cobertura
            </ThemedText>
            <View style={styles.filaChips}>
              {TIPOS_COBERTURA.map((t) => (
                <Chip
                  key={t.valor}
                  etiqueta={t.etiqueta}
                  activo={form.tipoCobertura === t.valor}
                  onPress={() =>
                    campo(
                      "tipoCobertura",
                      form.tipoCobertura === t.valor ? null : t.valor,
                    )
                  }
                />
              ))}
            </View>
            <Pressable
              onPress={() =>
                setForm((prev) => {
                  const modalidadMultiple = !prev.modalidadMultiple;
                  const equipos =
                    modalidadMultiple && prev.equipos.length === 0
                      ? [equipoVacio(), equipoVacio()]
                      : modalidadMultiple
                        ? prev.equipos
                        : [];
                  const servicios = sincronizarCantidadesServicios(
                    equipos,
                    prev.servicios,
                    modalidadMultiple,
                  );
                  const primerEquipo = equipos[0];
                  return {
                    ...prev,
                    modalidadMultiple,
                    equipos,
                    servicios,
                    equipoMarca: !modalidadMultiple && primerEquipo ? primerEquipo.marca : prev.equipoMarca,
                    equipoModelo: !modalidadMultiple && primerEquipo ? primerEquipo.modelo : prev.equipoModelo,
                    equipoNroSerie: !modalidadMultiple && primerEquipo ? primerEquipo.nroSerie : prev.equipoNroSerie,
                  };
                })
              }
              style={styles.filaCheckbox}
            >
              <View
                style={[
                  styles.checkbox,
                  { borderColor: theme.border },
                  form.modalidadMultiple && {
                    backgroundColor: theme.primary,
                    borderColor: theme.primary,
                  },
                ]}
              />
              <ThemedText type="small">Modalidad múltiple</ThemedText>
            </Pressable>
          </Seccion>
          <Seccion titulo="3. Información del Cliente">
            <Campo
              etiqueta="Código del Cliente"
              valor={form.clienteCodigo}
              onCambia={(v) => campo("clienteCodigo", v)}
            />
            <SelectorTipo
              etiqueta="Tipo"
              valor={form.clienteTipo}
              onCambia={(v) => campo("clienteTipo", v)}
            />
            <Campo
              etiqueta="Nombre"
              valor={form.clienteNombre}
              onCambia={(v) => campo("clienteNombre", v)}
            />
            <Campo
              etiqueta="Dirección"
              valor={form.clienteDireccion}
              onCambia={(v) => campo("clienteDireccion", v)}
              multilinea
            />
            <Campo
              etiqueta="Municipio"
              valor={form.clienteMunicipio}
              onCambia={(v) => campo("clienteMunicipio", v)}
            />
            <Campo
              etiqueta="Provincia"
              valor={form.clienteProvincia}
              onCambia={(v) => campo("clienteProvincia", v)}
            />
          </Seccion>
          <Seccion titulo="4. Información del Servicio y Equipo">
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.subEtiqueta}
            >
              Modalidades de servicio
            </ThemedText>
            <View style={styles.filaChips}>
              {MODALIDADES_SERVICIO.map((m) => (
                <Chip
                  key={m.valor}
                  etiqueta={m.etiqueta}
                  activo={form.modalidadesServicio.includes(m.valor)}
                  onPress={() => alternarModalidad(m.valor)}
                />
              ))}
            </View>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.subEtiqueta}
            >
              Datos del equipo
            </ThemedText>
            <Campo
              etiqueta="Tipo"
              valor={form.equipoTipo}
              onCambia={(v) => campo("equipoTipo", v)}
            />
            {form.modalidadMultiple ? (
              <>
                <ThemedText type="smallBold">
                  Equipos atendidos ({form.equipos.length})
                </ThemedText>
                {form.equipos.map((equipo, indice) => (
                  <View
                    key={equipo.clave}
                    style={[styles.filaTabla, { borderColor: theme.border }]}
                  >
                    <ThemedText type="smallBold">Equipo {indice + 1}</ThemedText>
                    <View style={styles.filaTablaTop}>
                      <CampoChico
                        etiqueta="Marca"
                        valor={equipo.marca}
                        onCambia={(v) => actualizarEquipo(equipo.clave, "marca", v)}
                      />
                      <CampoChico
                        etiqueta="Modelo"
                        valor={equipo.modelo}
                        onCambia={(v) => actualizarEquipo(equipo.clave, "modelo", v)}
                      />
                    </View>
                    <Campo
                      etiqueta="Nº Serie / Inv."
                      valor={equipo.nroSerie}
                      onCambia={(v) => actualizarEquipo(equipo.clave, "nroSerie", v)}
                    />
                    <Pressable onPress={() => eliminarEquipo(equipo.clave)}>
                      <ThemedText type="small" style={{ color: theme.danger }}>
                        Quitar equipo
                      </ThemedText>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={agregarEquipo}
                  style={[styles.botonAgregar, { borderColor: theme.primary }]}
                >
                  <ThemedText style={{ color: theme.primary }}>
                    + Agregar equipo
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                <Campo
                  etiqueta="Marca"
                  valor={form.equipoMarca}
                  onCambia={(v) => campo("equipoMarca", v)}
                />
                <Campo
                  etiqueta="Modelo"
                  valor={form.equipoModelo}
                  onCambia={(v) => campo("equipoModelo", v)}
                />
                <Campo
                  etiqueta="Nº Serie / Inv."
                  valor={form.equipoNroSerie}
                  onCambia={(v) => campo("equipoNroSerie", v)}
                />
              </>
            )}
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.subEtiqueta}
            >
              Tiempos
            </ThemedText>
            <CampoFecha
              etiqueta="Fecha de inicio"
              valorISO={form.fechaInicio}
              modo="date"
              onCambia={(v) => campo("fechaInicio", v)}
            />
            <CampoFecha
              etiqueta="Fecha de fin"
              valorISO={form.fechaFin}
              modo="date"
              onCambia={(v) => campo("fechaFin", v)}
            />
            <Campo
              etiqueta="Tiempo de trabajo (minutos)"
              valor={form.tiempoTrabajoMinutos}
              onCambia={(v) => campo("tiempoTrabajoMinutos", v)}
              teclado="numeric"
            />
          </Seccion>
          <Seccion titulo="5. Detalles del Trabajo">
            <Campo
              etiqueta="Observaciones del trabajo realizado"
              valor={form.observaciones}
              onCambia={(v) => campo("observaciones", v)}
              multilinea
              alto
            />
          </Seccion>
          <Seccion titulo="6. Materiales Utilizados">
            {form.materiales.map((m) => (
              <View
                key={m.clave}
                style={[styles.filaTabla, { borderColor: theme.border }]}
              >
                <View style={styles.filaTablaTop}>
                  <CampoChico
                    etiqueta="Vale"
                    valor={m.vale}
                    onCambia={(v) => actualizarMaterial(m.clave, "vale", v)}
                  />
                  <CampoChico
                    etiqueta="Código"
                    valor={m.codigo}
                    onCambia={(v) => actualizarMaterial(m.clave, "codigo", v)}
                  />
                </View>
                <Campo
                  etiqueta="Descripción"
                  valor={m.descripcion}
                  onCambia={(v) =>
                    actualizarMaterial(m.clave, "descripcion", v)
                  }
                />
                <View style={styles.filaTablaTop}>
                  <CampoChico
                    etiqueta="UM"
                    valor={m.unidadMedida}
                    onCambia={(v) =>
                      actualizarMaterial(m.clave, "unidadMedida", v)
                    }
                  />
                  <CampoChico
                    etiqueta="Cant"
                    valor={m.cantidad}
                    onCambia={(v) =>
                      actualizarMaterial(
                        m.clave,
                        "cantidad",
                        v.replace(/[^0-9.,]/g, ""),
                      )
                    }
                    teclado="numeric"
                  />
                  <CampoChico
                    etiqueta="Nro Serie"
                    valor={m.nroSerie}
                    onCambia={(v) => actualizarMaterial(m.clave, "nroSerie", v)}
                  />
                </View>
                <View style={styles.filaTablaTop}>
                  <CampoChico
                    etiqueta="Importe CUP"
                    valor={m.importeCUP}
                    onCambia={(v) =>
                      actualizarMaterial(m.clave, "importeCUP", v)
                    }
                    teclado="numeric"
                  />
                  <CampoChico
                    etiqueta="Importe USD"
                    valor={m.importeUSD}
                    onCambia={(v) =>
                      actualizarMaterial(m.clave, "importeUSD", v)
                    }
                    teclado="numeric"
                  />
                </View>

                <Pressable
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      materiales: prev.materiales.filter(
                        (x) => x.clave !== m.clave,
                      ),
                    }))
                  }
                >
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Quitar
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  materiales: [...prev.materiales, materialVacio()],
                }))
              }
            >
              <View
                style={[styles.botonAgregar, { borderColor: theme.primary }]}
              >
                <ThemedText style={{ color: theme.primary }}>
                  + Agregar material
                </ThemedText>
              </View>
            </Pressable>
            <View style={styles.filaTotalTabla}>
              <ThemedText type="smallBold">Total materiales</ThemedText>
              <ThemedText type="smallBold">
                {formatoMoneda(totales.materialesCUP, "CUP")} ·{" "}
                {formatoMoneda(totales.materialesUSD, "USD")}
              </ThemedText>
            </View>
          </Seccion>
          <Seccion titulo="7. Servicios Prestados">
            <TextInput
              value={buscarTexto}
              onChangeText={setBuscarTexto}
              placeholder="Buscar en el Tarifario para agregar…"
              placeholderTextColor={theme.textMuted}
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
            />
            {buscando && (
              <ActivityIndicator
                style={{ marginVertical: Spacing.two }}
                color={theme.primary}
              />
            )}
            {resultadosBusqueda.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => agregarServicioDesdeResultado(r)}
              >
                <View
                  style={[
                    styles.resultadoBusqueda,
                    { borderColor: theme.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="small">{r.nombreServicio}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {r.codigoServicio}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" style={{ color: theme.primary }}>
                    {formatoMoneda(r.precioBase, "CUP")}
                  </ThemedText>
                </View>
              </Pressable>
            ))}

            {form.servicios.map((s) => (
              <View
                key={s.clave}
                style={[styles.filaTabla, { borderColor: theme.border }]}
              >
                <ThemedText type="smallBold">{s.descripcion}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {s.codigo}
                </ThemedText>
                <View style={styles.filaTablaTop}>
                  <CampoChico
                    etiqueta="Cant"
                    valor={s.cantidad}
                    onCambia={(v) => actualizarServicio(s.clave, "cantidad", v)}
                    teclado="numeric"
                    editable={!form.modalidadMultiple}
                  />
                  <CampoChico
                    etiqueta="Importe CUP"
                    valor={s.importeCUP}
                    onCambia={(v) =>
                      actualizarServicio(s.clave, "importeCUP", v)
                    }
                    teclado="numeric"
                  />
                  <CampoChico
                    etiqueta="Importe USD"
                    valor={s.importeUSD}
                    onCambia={(v) =>
                      actualizarServicio(s.clave, "importeUSD", v)
                    }
                    teclado="numeric"
                  />
                </View>
                <Pressable
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      servicios: prev.servicios.filter(
                        (x) => x.clave !== s.clave,
                      ),
                    }))
                  }

                  //corte 4
                >
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Quitar
                  </ThemedText>
                </Pressable>
              </View>
            ))}
            <View style={styles.filaTotalTabla}>
              <ThemedText type="smallBold">Total servicios</ThemedText>
              <ThemedText type="smallBold">
                {formatoMoneda(totales.serviciosCUP, "CUP")} ·{" "}
                {formatoMoneda(totales.serviciosUSD, "USD")}
              </ThemedText>
            </View>
          </Seccion>
          <Seccion titulo="8. Totales Generales">
            <View style={styles.filaTotalTabla}>
              <ThemedText type="title" style={{ fontSize: 20 }}>
                Total a pagar
              </ThemedText>
              <View>
                <ThemedText
                  type="smallBold"
                  style={{ color: theme.primary, textAlign: "right" }}
                >
                  {formatoMoneda(totales.totalCUP, "CUP")}
                </ThemedText>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={{ textAlign: "right" }}
                >
                  {formatoMoneda(totales.totalUSD, "USD")}
                </ThemedText>
              </View>
            </View>
          </Seccion>
          <Seccion titulo="9. Firmas y Conformidad">
            <ThemedText
              type="small"
              themeColor="textMuted"
              style={styles.subEtiqueta}
            >
              La firma dibujada queda para una fase posterior — por ahora se
              registra el dato y un check de conformidad.
            </ThemedText>

            <ThemedText type="smallBold" style={styles.subEtiqueta}>
              Control del folio (revisado por)
            </ThemedText>
            <Campo
              etiqueta="Nombre y apellidos"
              valor={form.revisorNombre}
              onCambia={(v) => campo("revisorNombre", v)}
            />
            <Campo
              etiqueta="Cargo"
              valor={form.revisorCargo}
              onCambia={(v) => campo("revisorCargo", v)}
            />
            <CampoFecha
              etiqueta="Fecha"
              valorISO={form.revisorFecha}
              modo="date"
              onCambia={(v) => campo("revisorFecha", v)}
            />
            <CasillaFirmado
              etiqueta="Revisado y conforme"
              activo={form.revisorFirmado}
              onPress={() => campo("revisorFirmado", !form.revisorFirmado)}
            />

            <View style={styles.filaEntreSecciones}>
              <ThemedText type="smallBold">
                Conformidad — Técnicos responsables
              </ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                Uno por cada técnico que participó (trabajo en brigada =
                varios).
              </ThemedText>
            </View>
            <Pressable
              onPress={() => {
                setTecnicoEditandoClave(null);
                setSelectorTecnico(true);
              }}
              style={[styles.botonAgregar, { borderColor: theme.primary }]}
            >
              <ThemedText style={{ color: theme.primary }}>
                + Agregar técnico
              </ThemedText>
            </Pressable>
            {form.tecnicos.map((t) => (
              <View
                key={t.clave}
                style={[styles.filaTabla, { borderColor: theme.border }]}
              >
                {t.tecnicoId != null ? (
                  <Pressable
                    onPress={() => {
                      setTecnicoEditandoClave(t.clave);
                      setSelectorTecnico(true);
                    }}
                    style={[
                      styles.selector,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.background,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <ThemedText type="small">Nombre</ThemedText>
                      <ThemedText type="smallBold">{t.nombre}</ThemedText>
                    </View>
                    <ThemedText themeColor="textSecondary">▼</ThemedText>
                  </Pressable>
                ) : (
                  <View style={styles.filaTablaTop}>
                    <CampoChico
                      etiqueta="Nombre y apellidos"
                      valor={t.nombre}
                      onCambia={(v) => actualizarTecnico(t.clave, "nombre", v)}
                    />
                    <CampoChico
                      etiqueta="Cargo"
                      valor={t.cargo}
                      onCambia={(v) => actualizarTecnico(t.clave, "cargo", v)}
                    />
                    <CampoChico
                      etiqueta="CI"
                      valor={t.ci}
                      onCambia={(v) => actualizarTecnico(t.clave, "ci", v)}
                      teclado="numeric"
                    />
                  </View>
                )}
                <Pressable
                  onPress={() => {
                    const tech = form.tecnicos.find((x) => x.clave === t.clave);
                    if (
                      !tech?.nombre.trim() ||
                      !tech.cargo.trim() ||
                      !tech.ci.trim()
                    ) {
                      Alert.alert(
                        "Técnico",
                        "Complete nombre y apellidos, cargo y CI antes de guardar.",
                      );
                      return;
                    }
                    Alert.alert(
                      "Agregar a la base de datos",
                      "¿Desea registrar este técnico en la base de datos para reutilizarlo en próximas órdenes?",
                      [
                        { text: "No", style: "cancel" },
                        {
                          text: "Sí, completar ficha",
                          onPress: () =>
                            router.push({
                              pathname: "/tecnicos",
                              params: {
                                nombre: tech.nombre.trim(),
                                cargo: tech.cargo.trim(),
                                ci: tech.ci.trim(),
                                desdeOrden: "1",
                              },
                            }),
                        },
                      ],
                    );
                  }}
                >
                  <ThemedText type="small" style={{ color: theme.primary }}>
                    ＋ Guardar este técnico en la base de datos
                  </ThemedText>
                </Pressable>
                <View style={styles.filaEntreTecnico}>
                  <CasillaFirmado
                    etiqueta="Conforme"
                    activo={t.firmado}
                    onPress={() => alternarFirmaTecnico(t.clave)}
                  />
                  <Pressable
                    onPress={() =>
                      setForm((prev) => ({
                        ...prev,
                        tecnicos: prev.tecnicos.filter(
                          (x) => x.clave !== t.clave,
                        ),
                      }))
                    }
                  >
                    <ThemedText type="small" style={{ color: theme.danger }}>
                      Quitar técnico
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
            <ThemedText type="smallBold" style={styles.subEtiqueta}>
              Conformidad — Cliente
            </ThemedText>
            <Campo
              etiqueta="Nombre y apellidos"
              valor={form.clienteFirmaNombre}
              onCambia={(v) => campo("clienteFirmaNombre", v)}
            />
            <Campo
              etiqueta="Cargo"
              valor={form.clienteFirmaCargo}
              onCambia={(v) => campo("clienteFirmaCargo", v)}
            />
            <Campo
              etiqueta="CI"
              valor={form.clienteFirmaCI}
              onCambia={(v) => campo("clienteFirmaCI", v)}
              teclado="numeric"
            />
            <CampoFecha
              etiqueta="Fecha"
              valorISO={form.clienteFirmaFecha}
              modo="date"
              onCambia={(v) => campo("clienteFirmaFecha", v)}
            />
            <CasillaFirmado
              etiqueta="Cliente conforme"
              activo={form.clienteFirmado}
              onPress={() => campo("clienteFirmado", !form.clienteFirmado)}
            />
          </Seccion>
          <Modal
            visible={selectorTecnico}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectorTecnico(false)}
          >
            <View style={styles.modalBackdrop}>
              <ThemedView type="surface" style={styles.modalCard}>
                <ThemedText type="smallBold">Agregar técnico</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Seleccione un técnico registrado o agregue uno manualmente.
                </ThemedText>
                <ScrollView style={styles.tecnicosLista} nestedScrollEnabled>
                  {tecnicosBD.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      setForm((prev) => {
                        const nuevo = {
                          clave: `t-${t.id}-${Date.now()}`,
                          tecnicoId: t.id,
                          nombre: t.nombre,
                          ci: t.ci,
                          cargo: t.cargo,
                          firmado: false,
                        };
                        if (!tecnicoEditandoClave)
                          return {
                            ...prev,
                            tecnicos: [...prev.tecnicos, nuevo],
                          };
                        return {
                          ...prev,
                          tecnicos: prev.tecnicos.map((item) =>
                            item.clave === tecnicoEditandoClave
                              ? { ...nuevo, clave: item.clave }
                              : item,
                          ),
                        };
                      });
                      setTecnicoEditandoClave(null);
                      setSelectorTecnico(false);
                    }}
                  >
                    <View
                      style={[
                        styles.tecnicoOpcion,
                        { borderBottomColor: theme.border },
                      ]}
                    >
                      <ThemedText type="smallBold">{t.nombre}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t.cargo} · CI {t.ci}
                      </ThemedText>
                    </View>
                  </Pressable>
                ))}
                </ScrollView>                <Pressable
                  onPress={() => {
                    setSelectorTecnico(false);
                    setForm((prev) =>
                      tecnicoEditandoClave
                        ? {
                            ...prev,
                            tecnicos: prev.tecnicos.map((item) =>
                              item.clave === tecnicoEditandoClave
                                ? tecnicoVacio()
                                : item,
                            ),
                          }
                        : {
                            ...prev,
                            tecnicos: [...prev.tecnicos, tecnicoVacio()],
                          },
                    );
                    setTecnicoEditandoClave(null);
                  }}
                  style={styles.modalBtn}
                >
                  <ThemedText
                    style={{ color: theme.primary, fontWeight: "700" }}
                  >
                    + Agregar técnico manualmente
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => setSelectorTecnico(false)}
                  style={styles.modalBtn}
                >
                  <ThemedText themeColor="textSecondary">Cerrar</ThemedText>
                </Pressable>
              </ThemedView>
            </View>
          </Modal>
          <Modal
            visible={selectorEstado}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectorEstado(false)}
          >
            <View style={styles.modalBackdrop}>
              <ThemedView type="surface" style={styles.modalCard}>
                <ThemedText type="smallBold">
                  Estado de la Orden de Servicio
                </ThemedText>
                {(
                  [
                    ["pendiente", "Pendiente"],
                    ["en_progreso", "En progreso"],
                    ["finalizada", "Finalizada"],
                    ["facturada", "Facturada"],
                  ] as const
                ).map(([valor, etiqueta]) => (
                  <Pressable
                    key={valor}
                    onPress={() => {
                      campo("estadoSeleccionado", valor);
                      setSelectorEstado(false);
                    }}
                    style={styles.modalBtn}
                  >
                    <ThemedText
                      type="smallBold"
                      style={{
                        color:
                          form.estadoSeleccionado === valor
                            ? theme.primary
                            : theme.text,
                      }}
                    >
                      {form.estadoSeleccionado === valor ? "✓ " : ""}
                      {etiqueta}
                    </ThemedText>
                  </Pressable>
                ))}
              </ThemedView>
            </View>
          </Modal>
          <Pressable onPress={guardar} disabled={guardando}>
            <ThemedView type="primary" style={styles.botonGuardar}>
              {guardando ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <ThemedText style={styles.botonGuardarTexto}>
                  Guardar Orden de Servicio
                </ThemedText>
              )}
            </ThemedView>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </SafeAreaView>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: import("react").ReactNode;
}) {
  const theme = useTheme();
  return (
    <ThemedView
      type="surface"
      style={[styles.seccion, { borderColor: theme.border }]}
    >
      <ThemedText type="smallBold" style={styles.seccionTitulo}>
        {titulo}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

function Campo({
  etiqueta,
  valor,
  onCambia,
  marcador,
  multilinea,
  alto,
  teclado,
}: {
  etiqueta: string;
  valor: string;
  onCambia: (v: string) => void;
  marcador?: string;
  multilinea?: boolean;
  alto?: boolean;
  teclado?: "default" | "numeric";
}) {
  const theme = useTheme();
  return (
    <View style={styles.campo}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <TextInput
        value={valor}
        onChangeText={onCambia}
        placeholder={marcador}
        placeholderTextColor={theme.textMuted}
        multiline={multilinea}
        keyboardType={teclado === "numeric" ? "numeric" : "default"}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            color: theme.text,
            borderColor: theme.border,
          },
          multilinea && (alto ? styles.inputAreaAlta : styles.inputArea),
        ]}
      />
    </View>
  );
}

function CampoChico({
  etiqueta,
  valor,
  onCambia,
  teclado,
  editable = true,
}: {
  etiqueta: string;
  valor: string;
  onCambia: (v: string) => void;
  teclado?: "default" | "numeric";
  editable?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.campo, styles.campoChico]}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <TextInput
        value={valor}
        onChangeText={onCambia}
        editable={editable !== false}
        keyboardType={teclado === "numeric" ? "numeric" : "default"}
        style={[
          styles.input,
          {
            backgroundColor: theme.background,
            color: theme.text,
            borderColor: theme.border,
          },
        ]}
      />
    </View>
  );
}

function Chip({
  etiqueta,
  activo,
  onPress,
}: {
  etiqueta: string;
  activo: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.chip,
          {
            borderColor: theme.border,
            backgroundColor: activo ? theme.primary : theme.background,
          },
        ]}
      >
        <ThemedText
          type="small"
          style={activo ? { color: "#FFFFFF" } : { color: theme.textSecondary }}
        >
          {etiqueta}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/** Selector de exactamente 2 opciones, reusando el Chip existente en vez de
 * sumar una librería de picker para un caso tan chico. */
function SelectorTipo({
  etiqueta,
  valor,
  onCambia,
}: {
  etiqueta: string;
  valor: string;
  onCambia: (v: string) => void;
}) {
  return (
    <View style={styles.campo}>
      <ThemedText type="small" themeColor="textSecondary">
        {etiqueta}
      </ThemedText>
      <View style={styles.filaChips}>
        {["Institucional", "Población"].map((op) => (
          <Chip
            key={op}
            etiqueta={op}
            activo={valor === op}
            onPress={() => onCambia(op)}
          />
        ))}
      </View>
    </View>
  );
}

function CasillaFirmado({
  etiqueta,
  activo,
  onPress,
}: {
  etiqueta: string;
  activo: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.filaCheckbox}>
      <View
        style={[
          styles.checkbox,
          { borderColor: theme.border },
          activo && {
            backgroundColor: theme.success,
            borderColor: theme.success,
          },
        ]}
      />
      <ThemedText type="small">{etiqueta}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  selector: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  centrado: { alignItems: "center", justifyContent: "center" },
  contenido: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  header: { gap: 2, marginBottom: Spacing.two },
  titulo: { fontSize: 24, lineHeight: 28 },
  seccion: {
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  seccionTitulo: { marginBottom: Spacing.one },
  subEtiqueta: { marginTop: Spacing.two },
  filaEntreSecciones: { marginTop: Spacing.two, gap: 2 },
  filaEntreTecnico: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  campo: { gap: 4 },
  campoChico: { flex: 1 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  inputArea: { minHeight: 60, textAlignVertical: "top" },
  inputAreaAlta: { minHeight: 100, textAlignVertical: "top" },
  filaChips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.one },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  filaCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2 },
  filaTabla: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  filaTablaTop: { flexDirection: "row", gap: Spacing.two },
  botonAgregar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    borderStyle: "dashed",
    padding: Spacing.two,
    alignItems: "center",
  },
  filaTotalTabla: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  resultadoBusqueda: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.one,
    gap: Spacing.two,
  },
  botonGuardar: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { padding: 18, borderRadius: 14, gap: 10, maxHeight: "80%" },
  errorCarga: { padding: 24, gap: 14 },
  errorTexto: { textAlign: "center" },
  modalBtn: { paddingVertical: 12 },
  tecnicosLista: { maxHeight: 280 },
  tecnicoOpcion: {
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  botonGuardarTexto: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
});
