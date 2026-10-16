import xml.etree.ElementTree as ET

def parse_soap_customers(xml_text):
    root = ET.fromstring(xml_text)
    def child_text(element, name):
        return next((child.text for child in element if child.tag.split("}")[-1] == name), None)
    return [{"id": child_text(item, "Id"), "name": child_text(item, "Name")} for item in root.iter() if item.tag.split("}")[-1] == "Customer"]
