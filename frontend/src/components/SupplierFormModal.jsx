import { useEffect, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import toast from "react-hot-toast";
import { createSupplier, updateSupplier } from "../api/suppliers";
import { useTranslation } from "react-i18next";

const EMPTY = { name: "", contact_email: "", phone: "" };

export default function SupplierFormModal({ show, onHide, supplier, onSaved }) {
  const { t } = useTranslation();
  const isEdit = !!supplier;
  const [data, setData] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (supplier) {
      setData({
        name: supplier.name,
        contact_email: supplier.contact_email || "",
        phone: supplier.phone || "",
      });
    } else {
      setData(EMPTY);
    }
    setErrors({});
  }, [supplier, show]);

  const handleChange = (e) => {
    setData({ ...data, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const saved = isEdit
        ? await updateSupplier(supplier.id, data)
        : await createSupplier(data);
      toast.success(isEdit ? t("supplier_modal.updated", "Supplier updated") : t("supplier_modal.created", "Supplier created"));
      onSaved(saved);
    } catch (err) {
      const respData = err.response?.data || {};
      const formatted = {};
      Object.keys(respData).forEach((k) => {
        formatted[k] = Array.isArray(respData[k])
          ? respData[k].join(" ")
          : respData[k];
      });
      setErrors(formatted);
      if (!Object.keys(formatted).length) toast.error(t("supplier_modal.save_failed", "Failed to save supplier"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>
          {isEdit ? t("components.modals.supplier.title_edit") : t("components.modals.supplier.title_new")}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>{t("components.modals.supplier.name")}</Form.Label>
            <Form.Control
              name="name"
              value={data.name}
              onChange={handleChange}
              isInvalid={!!errors.name}
              required
              autoFocus
            />
            <Form.Control.Feedback type="invalid">
              {errors.name}
            </Form.Control.Feedback>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t("components.modals.supplier.email")}</Form.Label>
            <Form.Control
              type="email"
              name="contact_email"
              value={data.contact_email}
              onChange={handleChange}
              isInvalid={!!errors.contact_email}
            />
            <Form.Control.Feedback type="invalid">
              {errors.contact_email}
            </Form.Control.Feedback>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t("components.modals.supplier.phone")}</Form.Label>
            <Form.Control
              name="phone"
              value={data.phone}
              onChange={handleChange}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            {t("components.modals.cancel")}
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? t("components.modals.saving") : isEdit ? t("common.update") : t("common.create")}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
