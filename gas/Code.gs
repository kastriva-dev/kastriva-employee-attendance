/** Kastriva Employee Attendance — GAS API foundation. Set Script Property APP_SHARED_SECRET. */
const APP_NAME="Kastriva Employee Attendance";
const SHEET_NAMES=["Employees","Attendance","Settings","Logs"];
function doPost(e){
 try{
  const body=JSON.parse((e&&e.postData&&e.postData.contents)||"{}");
  const expected=PropertiesService.getScriptProperties().getProperty("APP_SHARED_SECRET");
  if(!expected||!body.secret||!constantTimeEquals_(String(body.secret),String(expected)))return json_({ok:false,error:"Unauthorized"});
  let data;
  switch(String(body.action||"")){
   case "ping":data={service:APP_NAME,status:"online"};break;
   case "initialize":data=setupSystem();break;
   default:return json_({ok:false,error:"Unknown action"});
  }
  return json_({ok:true,action:body.action,data:data,timestamp:new Date().toISOString()});
 }catch(err){console.error(err);return json_({ok:false,error:"Internal GAS error"});}
}
function doGet(){return json_({ok:true,service:APP_NAME,message:"API ready. Use POST through Vercel proxy.",timestamp:new Date().toISOString()});}
function setupSystem(){
 const ss=SpreadsheetApp.getActiveSpreadsheet();
 if(!ss)throw new Error("Buka Apps Script dari Extensions > Apps Script pada Spreadsheet.");
 PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID",ss.getId());
 const schemas={
  Employees:["employee_id","nik","nama","jabatan","pin_hash","status","created_at"],
  Attendance:["attendance_id","employee_id","nik","nama","tanggal","jam_masuk","foto_masuk","lat_masuk","lng_masuk","accuracy_masuk","jam_pulang","foto_pulang","lat_pulang","lng_pulang","accuracy_pulang","status","created_at"],
  Settings:["key","value","updated_at"],Logs:["log_id","event","actor","detail","created_at"]
 };
 Object.keys(schemas).forEach(function(name){
  let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,schemas[name].length).setValues([schemas[name]]);sh.setFrozenRows(1);sh.getRange(1,1,1,schemas[name].length).setBackground("#173653").setFontColor("#fff").setFontWeight("bold");}
 });
 const settings=ss.getSheetByName("Settings");
 if(settings.getLastRow()===1)settings.getRange(2,1,4,3).setValues([
  ["photo_retention_days","14",new Date()],["delete_photos_only","TRUE",new Date()],["office_latitude","",new Date()],["office_longitude","",new Date()]
 ]);
 return {spreadsheetId:ss.getId(),sheets:SHEET_NAMES,initialized:true};
}
function json_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function constantTimeEquals_(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
