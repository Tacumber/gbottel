import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BarChartHorizontal, BarChartVertical, PieChart } from '@/components/charts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  obtenerIngresosPorMes, obtenerRendimientoServicios,
  obtenerResumenDashboard, obtenerUltimasOrdenes,
  type MesIngreso, type OrdenDashboard, type ServicioRendimiento,
} from '@/services/analyticsService';

type IconName = keyof typeof Ionicons.glyphMap;
const money=(n:number,currency:'CUP'|'USD')=>new Intl.NumberFormat('es-CU',{style:'currency',currency,maximumFractionDigits:0}).format(n||0);
const estado:Record<string,string>={pendiente:'Pendiente',en_progreso:'En progreso',finalizada:'Finalizada',facturada:'Facturada'};
const MESES_ES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const mesCorto=(m:string)=>{const [,mm]=m.split('-');const i=Number(mm)-1;return MESES_ES[i]??m;};
const SERIE_COLORES=['#2f6fed','#16a34a','#d97706','#7c3aed','#0891b2','#db2777'];

export default function TableroScreen(){
  const theme=useTheme();
  const [data,setData]=useState<Awaited<ReturnType<typeof obtenerResumenDashboard>>|null>(null);
  const [meses,setMeses]=useState<MesIngreso[]>([]);
  const [servicios,setServicios]=useState<ServicioRendimiento[]>([]);
  const [ultimas,setUltimas]=useState<OrdenDashboard[]>([]);
  const [cargando,setCargando]=useState(true);
  const cargar=useCallback(async()=>{
    setCargando(true);
    try{
      const [d,m,s,u]=await Promise.all([
        obtenerResumenDashboard(),obtenerIngresosPorMes(6),obtenerRendimientoServicios(6),
        obtenerUltimasOrdenes(10),
      ]);
      setData(d);setMeses(m.reverse());setServicios(s);setUltimas(u);
    } finally { setCargando(false); }
  },[]);
  useFocusEffect(useCallback(()=>{void cargar();},[cargar]));

  return <SafeAreaView style={styles.flex} edges={['top']}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><View><ThemedText type="title" style={styles.title}>Tablero</ThemedText><ThemedText themeColor="textSecondary">Resumen operativo y logros alcanzados</ThemedText></View></View>
    {cargando?<ActivityIndicator color={theme.primary}/>:<>
      <View style={styles.grid}>
        <Stat icon="clipboard-outline" title="Órdenes activas" value={String((data?.pendientes||0)+(data?.enProgreso||0))} sub={`${data?.pendientes||0} pendientes · ${data?.enProgreso||0} en progreso`} />
        <Stat icon="checkmark-done-outline" title="Completadas" value={String(data?.completadas||0)} sub={`${data?.facturadas||0} facturadas este mes`} />
        <Stat icon="cash-outline" title="Ingresos mensuales" value={money(data?.ingresoMesCUP||0,'CUP')} sub={money(data?.ingresoMesUSD||0,'USD')} accent />
        <Stat icon="construct-outline" title="Técnicos registrados" value={String(data?.tecnicosActivos||0)} sub="Activos en la base de datos" />
      </View>

      <ThemedView type="surface" style={[styles.card,{borderColor:theme.border}]}>
        <View style={styles.cardTitleRow}><Ionicons name="flag-outline" size={15} color={theme.text}/><ThemedText type="smallBold">Plan mensual</ThemedText></View>
        <ThemedText type="small" themeColor="textSecondary">Suma de la meta que cada técnico tiene configurada, contra lo facturado este mes.</ThemedText>
        {data?.planMensualCUP?<>
          <View style={[styles.barBg,{backgroundColor:theme.backgroundSelected}]}><View style={[styles.bar,{backgroundColor:(data.porcentajePlan||0)>=100?theme.success:theme.primary,width:`${Math.min(100,data.porcentajePlan||0)}%`}]} /></View>
          <ThemedText type="smallBold" style={{color:(data.porcentajePlan||0)>=100?theme.success:theme.primary}}>{(data.porcentajePlan||0).toFixed(0)}% del plan · {money(data.ingresoMesCUP||0,'CUP')} de {money(data.planMensualCUP,'CUP')}</ThemedText>
        </>:
          <ThemedText type="small" themeColor="textMuted">Nadie tiene una meta configurada todavía — se define por técnico en la pantalla Técnicos.</ThemedText>
        }
      </ThemedView>

      <ThemedView type="surface" style={[styles.card,{borderColor:theme.border}]}>
        <View style={styles.cardTitleRow}><Ionicons name="bar-chart-outline" size={15} color={theme.text}/><ThemedText type="smallBold">Facturación por mes</ThemedText></View>
        <ThemedText type="small" themeColor="textSecondary">Finalizadas y facturadas, últimos {meses.length||6} meses.</ThemedText>
        {meses.length===0?<ThemedText type="small" themeColor="textMuted">Todavía no hay ingresos registrados.</ThemedText>:
          <BarChartVertical data={meses.map(m=>({label:mesCorto(m.mes),value:m.cup}))} color={theme.primary} labelColor={theme.textSecondary} formatValue={(n)=>money(n,'CUP')} />
        }
        <View style={[styles.anualRow,{borderTopColor:theme.border}]}><ThemedText type="small" themeColor="textSecondary">Ingresos anuales</ThemedText><ThemedText type="smallBold">{money(data?.ingresoAnualCUP||0,'CUP')}</ThemedText></View>
      </ThemedView>

      <View style={styles.sideBySide}>
        <ThemedView type="surface" style={[styles.card,styles.half,{borderColor:theme.border}]}>
          <View style={styles.cardTitleRow}><Ionicons name="trophy-outline" size={15} color={theme.text}/><ThemedText type="smallBold">Top de servicios</ThemedText></View>
          {servicios.length===0?<ThemedText type="small" themeColor="textMuted">Sin datos.</ThemedText>:
            <BarChartHorizontal data={servicios.slice(0,6).map(s=>({label:s.servicio,value:s.cantidad}))} color={theme.success} labelColor={theme.textSecondary} valueColor={theme.text} truncarEn={20} />
          }
        </ThemedView>
        <ThemedView type="surface" style={[styles.card,styles.half,{borderColor:theme.border}]}>
          <View style={styles.cardTitleRow}><Ionicons name="pie-chart-outline" size={15} color={theme.text}/><ThemedText type="smallBold">Servicios con mayor aceptación</ThemedText></View>
          {servicios.length===0?<ThemedText type="small" themeColor="textMuted">Sin datos.</ThemedText>:
            <PieChart data={servicios.slice(0,6).map(s=>({label:s.servicio,value:s.cantidad}))} colors={SERIE_COLORES} />
          }
        </ThemedView>
      </View>

      <ThemedView type="surface" style={[styles.card,{borderColor:theme.border}]}><View style={styles.sectionHeader}><ThemedText type="smallBold">Últimas 10 órdenes</ThemedText><Link href="/ordenes"><ThemedText type="small" style={{color:theme.primary}}>Ver todas →</ThemedText></Link></View><View style={styles.tableHeader}><ThemedText type="smallBold" style={styles.colFolio}>Folio</ThemedText><ThemedText type="smallBold" style={styles.colClient}>Cliente</ThemedText><ThemedText type="smallBold" style={styles.colState}>Estado</ThemedText><ThemedText type="smallBold" style={styles.colMoney}>CUP</ThemedText><ThemedText type="smallBold" style={styles.colMoney}>USD</ThemedText></View>{ultimas.map(o=><Link key={o.id} href={`/orden-nueva?id=${o.id}`} asChild><Pressable style={StyleSheet.flatten([styles.tableRow,{borderTopColor:theme.border}])}><ThemedText type="small" numberOfLines={1} style={styles.colFolio}>{o.folio}</ThemedText><ThemedText type="small" numberOfLines={1} style={styles.colClient}>{o.cliente}</ThemedText><ThemedText type="small" numberOfLines={1} style={styles.colState}>{estado[o.estado]||o.estado}</ThemedText><ThemedText type="small" style={styles.colMoney}>{money(o.totalCUP,'CUP')}</ThemedText><ThemedText type="small" style={styles.colMoney}>{money(o.totalUSD,'USD')}</ThemedText></Pressable></Link>)}</ThemedView>
    </>}
  </ScrollView></SafeAreaView>
}
function Stat({icon,title,value,sub,accent}:{icon:IconName;title:string;value:string;sub:string;accent?:boolean}){
  const theme=useTheme();
  return <ThemedView type="surface" style={[styles.stat,{borderColor:theme.border}]}>
    <View style={styles.statTitleRow}><Ionicons name={icon} size={14} color={theme.textSecondary}/><ThemedText type="small" themeColor="textSecondary">{title}</ThemedText></View>
    <ThemedText type="title" style={[styles.statValue,accent&&{color:theme.primary}]}>{value}</ThemedText>
    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{sub}</ThemedText>
  </ThemedView>
}
const styles=StyleSheet.create({flex:{flex:1},content:{padding:Spacing.four,gap:Spacing.three,paddingBottom:Spacing.six},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},title:{fontSize:28,lineHeight:32},white:{color:'#fff',fontWeight:'700'},grid:{flexDirection:'row',flexWrap:'wrap',gap:Spacing.two},stat:{width:'48%',padding:Spacing.three,borderRadius:Spacing.three,borderWidth:StyleSheet.hairlineWidth,gap:3},statTitleRow:{flexDirection:'row',alignItems:'center',gap:5},statValue:{fontSize:22,lineHeight:28},card:{padding:Spacing.three,borderRadius:Spacing.three,borderWidth:StyleSheet.hairlineWidth,gap:Spacing.two},cardTitleRow:{flexDirection:'row',alignItems:'center',gap:6},sideBySide:{flexDirection:'row',gap:Spacing.two},half:{flex:1},barBg:{height:10,borderRadius:8,overflow:'hidden'},bar:{height:'100%',borderRadius:8},anualRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingTop:10,marginTop:2,borderTopWidth:StyleSheet.hairlineWidth},sectionHeader:{flexDirection:'row',justifyContent:'space-between'},tableHeader:{flexDirection:'row',paddingBottom:6},tableRow:{flexDirection:'row',paddingVertical:9,borderTopWidth:StyleSheet.hairlineWidth,alignItems:'center'},colFolio:{width:58},colClient:{flex:1,minWidth:0,paddingRight:5},colState:{width:80},colMoney:{width:82,textAlign:'right'}});
