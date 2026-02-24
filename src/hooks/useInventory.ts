import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import type { Product, Category } from '../types/database'
import toast from 'react-hot-toast'

export function useInventory() {
  const { profile } = useAuthStore()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const isOwner = profile?.role === 'owner'

  useEffect(() => { fetchAll() }, [profile])

  const fetchAll = async () => {
    setIsLoading(true)
    await Promise.all([fetchProducts(), fetchCategories()])
    setIsLoading(false)
  }

  const fetchProducts = async () => {
    let q = supabase
      .from('products')
      .select('*, category:categories(id,name)')
      .order('name')
    if (!isOwner) q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setProducts(data || [])
  }

  const fetchCategories = async () => {
    let q = supabase.from('categories').select('*').order('name')
    if (!isOwner) q = q.eq('location_id', profile?.location_id)
    const { data } = await q
    setCategories(data || [])
  }

  const addProduct = async (values: Partial<Product>) => {
    const { error } = await supabase.from('products').insert({
      ...values,
      location_id: profile?.location_id,
    })
    if (error) throw error
    await fetchProducts()
    toast.success('Product added successfully')
  }

  const updateProduct = async (id: string, values: Partial<Product>) => {
    const { error } = await supabase.from('products').update(values).eq('id', id)
    if (error) throw error
    await fetchProducts()
    toast.success('Product updated')
  }

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) throw error
    await fetchProducts()
    toast.success('Product deleted')
  }

  const addCategory = async (name: string) => {
    const { error } = await supabase.from('categories').insert({
      name,
      location_id: profile?.location_id,
    })
    if (error) throw error
    await fetchCategories()
    toast.success('Category added')
  }

  const bulkImport = async (rows: Partial<Product>[]) => {
    const enriched = rows.map(r => ({ ...r, location_id: profile?.location_id }))
    const { error } = await supabase.from('products').insert(enriched)
    if (error) throw error
    await fetchProducts()
    toast.success(`${rows.length} products imported!`)
  }

  return {
    products, categories, isLoading,
    fetchProducts, fetchCategories,
    addProduct, updateProduct, deleteProduct,
    addCategory, bulkImport,
  }
}