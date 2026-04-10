declare module "china-map-geojson" {
  export const ChinaData: Record<string, unknown>;
  export const ProvinceData: Record<string, unknown>;
}

declare module "china-map-geojson/lib/province/shan_dong_geo" {
  const ShanDongGeo: Record<string, unknown>;
  export default ShanDongGeo;
}
