import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { formatearFecha } from '@/utils/fechas';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { eliminarOrden } from '@/services/ordenesService';
import { exportarOrdenesCSV, exportarOrdenesJSON, exportarOrdenesPDF, importarOrdenesJSON } from '@/services/respaldoService';
import { obtenerOrdenesFiltradas, obtenerResumenDashboard, type OrdenDashboard } from '@/services/analyticsService';
import type { EstadoOrden } from '@/types/ordenes.types';

const states:[EstadoOrden,string][]=[['pendiente','Pendientes'],['en_progreso','En progreso'],['finalizada','Finalizadas'],['facturada','Facturadas']];
const money=(n:number,c:'CUP'|'USD')=>new Intl.NumberFormat('es-CU',{style:'currency',currency:c,maximumFractionDigits:0}).format(n||0);
const label:Record<string,string>={pendiente:'Pendiente',en_progreso:'En progreso',finalizada:'Finalizada',facturada:'Facturada'};
const TABLE_WIDTH=34+72+170+82+104+92+92;

export default function OrdenesScreen(){
  const theme=useTheme();
  const [rows,setRows]=useState<OrdenDashboard[]>([]);
  const [q,setQ]=useState('');
  const [state,setState]=useState<string|undefined>();
  const [loading,setLoading]=useState(true);
  const [totalRegistradas,setTotalRegistradas]=useState(0);
  const [seleccionados,setSeleccionados]=useState<Set<number>>(new Set());
  const [modoSeleccion,setModoSeleccion]=useState(false);
  const [exportando,setExportando]=useState(false);

  const cargar=useCallback(async()=>{
    setLoading(true);
    try{
      const [r,d]=await Promise.all([obtenerOrdenesFiltradas({termino:q,estado:state,limite:300}),obtenerResumenDashboard()]);
      setRows(r);setTotalRegistradas(d.totalOrdenes);
    } finally { setLoading(false); }
  },[q,state]);
  useFocusEffect(useCallback(()=>{void cargar();},[cargar]));

  const borrar=(id:number)=>Alert.alert('Eliminar Orden de Servicio','Esta acción elimina la orden y sus detalles. ¿Continuar?',[{text:'Cancelar',style:'cancel'},{text:'Eliminar',style:'destructive',onPress:async()=>{await eliminarOrden(id);await cargar()}}]);

  const abrirMenu=(item:OrdenDashboard)=>Alert.alert(item.folio,item.cliente,[
    {text:'Cancelar',style:'cancel'},
    {text:'Editar',onPress:()=>router.push(`/orden-nueva?id=${item.id}`)},
    {text:'Eliminar',style:'destructive',onPress:()=>borrar(item.id)},
  ]);

  const alternarFila=(id:number)=>setSeleccionados((prev)=>{
    const siguiente=new Set(prev);
    if(siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
    return siguiente;
  });
  const tocarFila=(item:OrdenDashboard)=>modoSeleccion?alternarFila(item.id):abrirMenu(item);
  const mantenerFila=(item:OrdenDashboard)=>{ if(!modoSeleccion) setModoSeleccion(true); alternarFila(item.id); };
  const todasSeleccionadas=rows.length>0&&rows.every((r)=>seleccionados.has(r.id));
  const alternarTodas=()=>setSeleccionados(todasSeleccionadas?new Set():new Set(rows.map((r)=>r.id)));
  const salirSeleccion=()=>{ setModoSeleccion(false); setSeleccionados(new Set()); };

  const exportar=()=>{
    const objetivo=seleccionados.size?rows.filter((r)=>seleccionados.has(r.id)):rows;
    if(!objetivo.length){ Alert.alert('Nada para exportar','No hay órdenes en la vista actual.'); return; }
    Alert.alert('Exportar','¿En qué formato?',[
      {text:'Cancelar',style:'cancel'},
      {text:'PDF',onPress:()=>void ejecutarExport(()=>exportarOrdenesPDF(objetivo))},
      {text:'Excel (CSV)',onPress:()=>void ejecutarExport(()=>exportarOrdenesCSV(objetivo))},
      {text:'JSON (traspaso)',onPress:()=>void ejecutarExport(()=>exportarOrdenesJSON(objetivo))},
    ]);
  };
  const ejecutarExport=async(fn:()=>Promise<void>)=>{
    setExportando(true);
    try{ await fn(); } catch(e){ Alert.alert('Error al exportar',e instanceof Error?e.message:String(e)); }
    finally{ setExportando(false); }
  };

  const importarJSON=()=>{
    Alert.alert('Traspaso de órdenes','¿Mantener la numeración de folios que ya tenés? Las órdenes nuevas se agregan después, ordenadas por fecha entre ellas. Si elegís renumerar, se reordenan TODAS tus órdenes (las que ya tenías y las nuevas) por fecha estricta — cambia folios que ya existían.',[
      {text:'Cancelar',style:'cancel'},
      {text:'Mantener folios',onPress:()=>void ejecutarImportarJSON(true)},
      {text:'Renumerar todo',style:'destructive',onPress:()=>void ejecutarImportarJSON(false)},
    ]);
  };
  const ejecutarImportarJSON=async(mantener:boolean)=>{
    setExportando(true);
    try{
      const r=await importarOrdenesJSON(mantener);
      if(r){ Alert.alert('Traspaso completado',`${r.importadas} orden${r.importadas===1?'':'es'} importada${r.importadas===1?'':'s'}.${r.omitidas?` ${r.omitidas} ya existían y se omitieron.`:''}`); await cargar(); }
    } catch(e){ Alert.alert('Error al importar',e instanceof Error?e.message:String(e)); }
    finally{ setExportando(false); }
  };

  return <SafeAreaView style={styles.flex} edges={['top']}><ThemedView style={styles.flex}>
    <View style={[styles.header,{alignItems:'flex-start'}]}>
      <View><ThemedText type="title" style={styles.title}>Órdenes de Servicio</ThemedText><ThemedText themeColor="textSecondary">{loading?'Actualizando…':`${rows.length} orden${rows.length===1?'':'es'} en la vista`}</ThemedText></View>
      <Pressable onPress={()=>router.push('/orden-nueva')}><ThemedView type="primary" style={styles.new}><ThemedText style={[styles.white,styles.newIcon]}>+</ThemedText></ThemedView></Pressable>
    </View>

    <View style={styles.searchRow}><View style={[styles.searchWrap,{borderColor:theme.border,backgroundColor:theme.surface}]}><TextInput value={q} onChangeText={setQ} placeholder="Buscar por folio, cliente, código…" placeholderTextColor={theme.textMuted} style={[styles.searchInput,{color:theme.text}]}/><Ionicons name="search-outline" size={16} color={theme.textMuted}/></View></View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {states.map(([id,text])=><Pressable key={id} onPress={()=>setState(state===id?undefined:id)}><View style={[styles.filter,{borderColor:theme.border,backgroundColor:state===id?theme.primary:theme.surface}]}><ThemedText type="small" style={{color:state===id?'#fff':theme.textSecondary}}>{text}</ThemedText></View></Pressable>)}
    </ScrollView>

    {modoSeleccion?
      <View style={styles.seleccionBar}>
        <Pressable onPress={alternarTodas} style={styles.checkAllRow}><View style={[styles.check,{borderColor:theme.border},todasSeleccionadas&&{backgroundColor:theme.primary,borderColor:theme.primary}]}>{todasSeleccionadas&&<ThemedText style={styles.checkMark}>✓</ThemedText>}</View><ThemedText type="small">{todasSeleccionadas?'Ninguna':'Todas'}</ThemedText></Pressable>
        <ThemedText type="smallBold">{seleccionados.size} seleccionada{seleccionados.size===1?'':'s'}</ThemedText>
        <Pressable onPress={salirSeleccion}><ThemedText type="small" style={{color:theme.primary}}>Cancelar</ThemedText></Pressable>
      </View>
      :
      <View style={styles.counter}><ThemedText type="smallBold">Contador de órdenes</ThemedText><ThemedText type="small" themeColor="textSecondary">{totalRegistradas} registradas · {rows.length} mostradas</ThemedText></View>
    }

    <View style={styles.exportRow}>
      <Pressable onPress={exportar} disabled={exportando} style={[styles.exportBtn,{flex:1,borderColor:theme.border}]}>
        {exportando?<ActivityIndicator size="small" color={theme.primary}/>:<ThemedText type="small" style={{color:theme.primary}}>⇩ Exportar {seleccionados.size?`(${seleccionados.size})`:'todas'}</ThemedText>}
      </Pressable>
      <Pressable onPress={importarJSON} disabled={exportando} style={[styles.exportBtn,{flex:1,borderColor:theme.border}]}>
        <ThemedText type="small" style={{color:theme.primary}}>⇧ Importar JSON</ThemedText>
      </Pressable>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.flex} contentContainerStyle={{flexGrow:1}}>
      <View style={{width:TABLE_WIDTH,flex:1}}>
        <View style={styles.tableHeader}>
          {modoSeleccion&&<View style={styles.colCheck}/>}
          <ThemedText type="smallBold" style={styles.folio}>Folio</ThemedText>
          <ThemedText type="smallBold" style={styles.client}>Cliente</ThemedText>
          <ThemedText type="smallBold" style={styles.date}>Fecha</ThemedText>
          <ThemedText type="smallBold" style={styles.status}>Estado</ThemedText>
          <ThemedText type="smallBold" style={styles.money}>CUP</ThemedText>
          <ThemedText type="smallBold" style={styles.money}>USD</ThemedText>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void cargar()} colors={[theme.primary]} tintColor={theme.primary}/>}>
          {!loading&&rows.length===0&&<View style={styles.empty}><ThemedText themeColor="textSecondary">No hay órdenes con esos filtros.</ThemedText></View>}
          {rows.map((item)=>{
            const marcada=seleccionados.has(item.id);
            return <Pressable key={item.id} onPress={()=>tocarFila(item)} onLongPress={()=>mantenerFila(item)} style={[styles.row,{borderTopColor:theme.border},marcada&&{backgroundColor:theme.backgroundSelected}]}>
              {modoSeleccion&&<View style={styles.colCheck}><View style={[styles.check,{borderColor:theme.border},marcada&&{backgroundColor:theme.primary,borderColor:theme.primary}]}>{marcada&&<ThemedText style={styles.checkMark}>✓</ThemedText>}</View></View>}
              <ThemedText type="small" numberOfLines={1} style={styles.folio}>{item.folio}</ThemedText>
              <ThemedText type="small" numberOfLines={1} style={styles.client}>{item.cliente}</ThemedText>
              <ThemedText type="small" style={styles.date}>{formatearFecha(item.fecha)}</ThemedText>
              <View style={styles.status}><View style={[styles.badge,{backgroundColor:theme.backgroundSelected}]}><ThemedText type="small">{label[item.estado]||item.estado}</ThemedText></View></View>
              <ThemedText type="small" style={styles.money}>{money(item.totalCUP,'CUP')}</ThemedText>
              <ThemedText type="small" style={styles.money}>{money(item.totalUSD,'USD')}</ThemedText>
            </Pressable>;
          })}
        </ScrollView>
      </View>
    </ScrollView>
  </ThemedView></SafeAreaView>;
}

const styles=StyleSheet.create({
  flex:{flex:1},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:Spacing.four,paddingBottom:Spacing.two},
  title:{fontSize:27},
  new:{width:40,height:40,borderRadius:10,alignItems:'center',justifyContent:'center'},
  newIcon:{fontSize:22,lineHeight:24},
  white:{color:'#fff',fontWeight:'700'},
  searchRow:{paddingHorizontal:Spacing.four},
  searchWrap:{flexDirection:'row',alignItems:'center',borderWidth:1,borderRadius:8,paddingLeft:12,paddingRight:10},
  searchInput:{flex:1,paddingVertical:9,paddingRight:8},
  searchIcon:{fontSize:16},
  filters:{gap:8,paddingHorizontal:Spacing.four,paddingVertical:10},
  filter:{borderWidth:1,borderRadius:999,paddingHorizontal:12,paddingVertical:7},
  counter:{marginHorizontal:Spacing.four,paddingVertical:8,flexDirection:'row',justifyContent:'space-between'},
  seleccionBar:{marginHorizontal:Spacing.four,paddingVertical:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  checkAllRow:{flexDirection:'row',alignItems:'center',gap:6},
  check:{width:18,height:18,borderRadius:4,borderWidth:1.5,alignItems:'center',justifyContent:'center'},
  checkMark:{color:'#fff',fontSize:12,fontWeight:'700'},
  exportRow:{flexDirection:'row',gap:8,marginHorizontal:Spacing.four,marginBottom:8},
  exportBtn:{paddingVertical:9,borderRadius:8,borderWidth:1,alignItems:'center'},
  tableHeader:{flexDirection:'row',paddingHorizontal:Spacing.four,paddingVertical:8,backgroundColor:'#eee',alignItems:'center'},
  row:{flexDirection:'row',paddingHorizontal:Spacing.four,paddingVertical:11,borderTopWidth:StyleSheet.hairlineWidth,alignItems:'center'},
  colCheck:{width:34,alignItems:'flex-start'},
  folio:{width:72},
  client:{width:170,paddingRight:5},
  date:{width:82},
  status:{width:104},
  money:{width:92,textAlign:'right'},
  badge:{alignSelf:'flex-start',paddingHorizontal:6,paddingVertical:4,borderRadius:999},
  list:{paddingBottom:Spacing.six},
  empty:{padding:Spacing.six,alignItems:'center',width:'100%'},
});
