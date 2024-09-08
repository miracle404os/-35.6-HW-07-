import axios from "axios";
import { IProduct, IProductFilterPayload } from "@Shared/types";
import { IProductEditData } from "../types";
import { API_HOST } from "./const";

export async function getProducts(): Promise<IProduct[]> {
  const { data } = await axios.get<IProduct[]>(`${API_HOST}/products`);
  return data || [];
}

export async function searchProducts(
  filter: IProductFilterPayload
): Promise<IProduct[]> {
  const { data } = await axios.get<IProduct[]>(
    `${API_HOST}/products/search`,
    { params: filter }
  );
  return data || [];
}

export async function getProduct(
  id: string
): Promise<IProduct | null> {
  try {
    const { data } = await axios.get<IProduct>(
      `${API_HOST}/products/${id}`
    );
    return data;
  } catch (e) {
    return null;
  }
}

export async function removeProduct(id: string): Promise<void> {
  await axios.delete(`${API_HOST}/products/${id}`);
}

function splitNewImages(str = ""): string[] {
  return str
    .split(/\r\n|,/g)
    .map(url => url.trim())
    .filter(url => url);
}

function compileIdsToRemove(data: string | string[]): string[] {
  if (typeof data === "string") return [data];
  return data;
}

export async function createProduct(formData: IProductEditData): Promise<IProduct | null> {
  try {
    const payload: IProduct = {
      id: "",
      title: formData.title,
      description: formData.description,
      price: Number(formData.price)
    }

    const { data } = await axios.post<IProduct>(`${API_HOST}/products`, payload);
    return data;
  } catch (e) {
    return null;
  }
}


export async function getSimilarProducts(
  originProductId: string
): Promise<IProduct[] | null> {
  try {
    const { data } = await axios.get<IProduct[]>(
      `${API_HOST}/products/similar/${originProductId}`
    );
    return data;
  } catch (e) {
    return null;
  }
}

export async function getNotSimilarProducts(
  originProductId: string,
  similarProducts: IProduct[] = []
): Promise<IProduct[] | []> {
  try {
    const similarIdsSet = new Set(similarProducts.map(({ id }) => id));

    const { data = [] } = await axios.get<IProduct[]>(`${API_HOST}/products`);

    return data.filter(product => {
      return product.id !== originProductId && !similarIdsSet.has(product.id);
    });
  } catch (e) {
    return null;
  }
}
